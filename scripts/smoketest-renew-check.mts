/**
 * Manual smoke test for POST /api/renew-check (Track E1) against a real
 * local dev server + real Stripe test mode — not a vitest/CI test, since
 * this needs `yarn dev` and `stripe listen` running as separate long-lived
 * processes. Seeds three throwaway members that all match renew-check's
 * candidate filter (status active/canceling, matches_remaining <= 0), and
 * processes them in the same call, matching how the real cron batch runs:
 *
 *   - a BILLABLE candidate (status "active", real card on file, set on
 *     both the customer and the subscription) — confirms the full renew
 *     loop: pause_collection cleared, invoice created,
 *     invoice.payment_succeeded webhook credits the counter and re-pauses
 *     the subscription.
 *   - a BILLABLE candidate whose card lives ONLY on the Stripe
 *     SUBSCRIPTION's default_payment_method, never set as the customer's
 *     own invoice_settings.default_payment_method — regression coverage
 *     for the 2026-09-11 bug where real Checkout-created subscriptions
 *     attach the card this way, and the payment-method guard checked only
 *     the customer-level field, silently treating every one of them as if
 *     they had no payment method at all (see the guard's docblock in
 *     app/api/renew-check/route.ts). Must be billed exactly like the
 *     first candidate.
 *   - a CANCELING candidate (status "canceling" — already declined to
 *     renew) — confirms the other branch, added so renew-check stops
 *     silently rebilling someone who's leaving: no invoice at all, just an
 *     explicit stripe.subscriptions.cancel(), which fires
 *     customer.subscription.deleted and lets the existing webhook set
 *     members.status -> inactive.
 *
 * Prerequisites (see __claude__/billing-simplification-plan.md and this
 * script's own preflight checks):
 *   1. `yarn dev -p 3001` running in one terminal
 *   2. `stripe listen --forward-to localhost:3001/api/webhooks/stripe`
 *      running in another (required for both webhook-driven assertions
 *      below — the billable candidate's credit + re-pause, and the
 *      canceling candidate's members.status -> inactive — without it
 *      this script will see renew-check's own immediate response look
 *      right but time out waiting for either to actually land)
 *
 * Usage:
 *   tsx scripts/smoketest-renew-check.mts
 *   RENEW_CHECK_BASE_URL=http://localhost:3001 tsx scripts/smoketest-renew-check.mts
 *
 * Safety: hard-guarded to .env.local resolving to a Stripe *test* key and a
 * non-production Supabase project, same pattern as seed-test-members.mts.
 *
 * Preflight gotcha (already true of __tests__/api/renew-check.test.ts, see
 * scripts/test-quiet.sh): renew-check's own candidate query is unscoped —
 * status active/canceling + matches_remaining <= 0, no test-run id to
 * filter by, because that's exactly what the real cron job does too. The
 * reference members seed-test-members.mts creates land on a *random*
 * matches_remaining (0-5) every run, so there's a real chance one or more
 * of them already sit at 0 and get swept into the same renew-check call
 * this script triggers. Harmless in Stripe test mode, but it does mean
 * their real (salvaged) Stripe subscriptions get paused/invoiced/canceled
 * too, not just their DB row — which `yarn seed-test-members` only resets
 * the DB side of. This script reports who else currently matches before
 * running, and reminds you to re-run `yarn seed-test-members` afterward
 * regardless.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

config({ path: resolve(process.cwd(), ".env.local") });

const BASE_URL = process.env.RENEW_CHECK_BASE_URL ?? "http://localhost:3001";
const LOOKUP_KEY = "commitment_3mo"; // 3-month bundle — matches the interval_count used elsewhere in this repo's seed/e2e helpers

// ---------------------------------------------------------------------------
// Safety guards — never let this run against production, even by accident.
// Same pattern as scripts/seed-test-members.mts.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

if (!stripeSecretKey.startsWith("sk_test_")) {
  console.error(`Refusing to run: .env.local's STRIPE_SECRET_KEY doesn't look like a test key (got prefix "${stripeSecretKey.slice(0, 8)}...").`);
  process.exit(1);
}

const prodEnv: Record<string, string> = {};
config({ path: resolve(process.cwd(), ".env.production"), processEnv: prodEnv });
if (prodEnv.NEXT_PUBLIC_SUPABASE_URL === supabaseUrl) {
  console.error("Refusing to run: .env.local resolves to the same Supabase project as .env.production.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "postpartumpost" } });
const stripe = new Stripe(stripeSecretKey);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Preflight — who else would this call touch?
// ---------------------------------------------------------------------------

async function reportExistingCandidates(): Promise<void> {
  const { data, error } = await supabase
    .from("members")
    .select("id, email, status, matches_remaining")
    .in("status", ["active", "canceling"])
    .lte("matches_remaining", 0);

  if (error) {
    console.error("Preflight candidate check failed:", error.message);
    return;
  }
  if (!data?.length) {
    console.log("Preflight: no other billable-at-zero members exist right now — this run will only touch the two seeded below.\n");
    return;
  }
  console.log(`Preflight: ${data.length} other member(s) already match renew-check's candidate filter and will ALSO be processed:`);
  for (const m of data) {
    console.log(`  - ${m.email} (${m.id}) — status=${m.status}, matches_remaining=${m.matches_remaining}`);
  }
  console.log("Harmless in Stripe test mode, but run `yarn seed-test-members` after this finishes to restore them.\n");
}

// ---------------------------------------------------------------------------
// Seed a throwaway billable member with a real Stripe test subscription and
// a real card on file (required — renew-check skips anyone with no
// default_payment_method).
// ---------------------------------------------------------------------------

async function seedBillableCandidate() {
  const tag = crypto.randomUUID().slice(0, 8);
  const email = `amsterdamparentproject+renewcheck-smoketest-billable-${tag}@gmail.com`;

  const customer = await stripe.customers.create({
    email,
    name: "Renew-Check Smoketest (billable)",
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });

  const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`Price with lookup key "${LOOKUP_KEY}" not found in Stripe test mode — has it been created?`);
  if (price.unit_amount === null) throw new Error(`Price "${LOOKUP_KEY}" has no unit_amount — renew-check can't bill it.`);

  // 30-day trial so creating this subscription doesn't itself trigger an
  // invoice.payment_succeeded credit — we want matches_remaining to start
  // at exactly 0, under our control, not racing the checkout-time grant.
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });

  const { data: memberRow, error: memberError } = await supabase
    .from("members")
    .insert({
      email,
      first_name: "Renew-Check",
      last_name: "Smoketest (billable)",
      status: "active",
      stripe_customer_id: customer.id,
      consecutive_skips: 0,
      matches_remaining: 0,
    })
    .select("id")
    .single();
  if (memberError || !memberRow) throw new Error(`Member insert failed: ${memberError?.message}`);

  const { error: subError } = await supabase.from("subscriptions").insert({
    member_id: memberRow.id,
    stripe_subscription_id: sub.id,
    stripe_price_id: price.id,
    status: "active",
  });
  if (subError) throw new Error(`Subscription insert failed: ${subError.message}`);

  return {
    memberId: memberRow.id as string,
    email,
    customerId: customer.id,
    subscriptionId: sub.id,
    expectedMatches: price.recurring?.interval_count ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Seed a throwaway member who has already declined to renew — status
// "canceling", matches_remaining=0. finalizeCancellation() doesn't gate on
// a payment method the way renewMember() does, but we give it a card
// anyway to mirror a real member (who'd typically still have one on file
// from their last paid term).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Seed a throwaway billable member whose card lives ONLY on the Stripe
// SUBSCRIPTION's default_payment_method — deliberately never set as the
// customer's own invoice_settings.default_payment_method. Regression
// coverage for the 2026-09-11 bug: real Checkout-created subscriptions
// attach the card this way, and the payment-method guard in
// app/api/renew-check/route.ts used to check only the customer-level
// field, silently treating every one of these real, paying members as if
// they had no payment method at all. This candidate must be billed
// exactly like seedBillableCandidate()'s.
// ---------------------------------------------------------------------------

async function seedSubscriptionLevelCardCandidate() {
  const tag = crypto.randomUUID().slice(0, 8);
  const email = `amsterdamparentproject+renewcheck-smoketest-sublevelcard-${tag}@gmail.com`;

  // Deliberately no `payment_method` / `invoice_settings` here — the
  // customer must end up with no default payment method of its own.
  const customer = await stripe.customers.create({
    email,
    name: "Renew-Check Smoketest (subscription-level card)",
  });

  // Attach a card to the customer without ever marking it as that
  // customer's default — then hand it to the subscription directly.
  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });

  const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`Price with lookup key "${LOOKUP_KEY}" not found in Stripe test mode — has it been created?`);
  if (price.unit_amount === null) throw new Error(`Price "${LOOKUP_KEY}" has no unit_amount — renew-check can't bill it.`);

  // Same 30-day trial as seedBillableCandidate, same reasoning: start
  // matches_remaining at exactly 0 under our control. default_payment_method
  // is set here, on the subscription itself, not on the customer.
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    default_payment_method: paymentMethod.id,
    trial_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });

  // Belt-and-suspenders — fail loudly here rather than get a confusing
  // false pass/fail further down if Stripe's attach/create behavior around
  // customer-level defaults ever changes.
  const freshCustomer = await stripe.customers.retrieve(customer.id);
  if (
    typeof freshCustomer !== "string" &&
    !freshCustomer.deleted &&
    freshCustomer.invoice_settings?.default_payment_method
  ) {
    throw new Error(
      "Test setup invariant broken: customer.invoice_settings.default_payment_method should be unset for this candidate — the regression test wouldn't actually exercise the subscription-level fallback."
    );
  }

  const { data: memberRow, error: memberError } = await supabase
    .from("members")
    .insert({
      email,
      first_name: "Renew-Check",
      last_name: "Smoketest (subscription-level card)",
      status: "active",
      stripe_customer_id: customer.id,
      consecutive_skips: 0,
      matches_remaining: 0,
    })
    .select("id")
    .single();
  if (memberError || !memberRow) throw new Error(`Member insert failed: ${memberError?.message}`);

  const { error: subError } = await supabase.from("subscriptions").insert({
    member_id: memberRow.id,
    stripe_subscription_id: sub.id,
    stripe_price_id: price.id,
    status: "active",
  });
  if (subError) throw new Error(`Subscription insert failed: ${subError.message}`);

  return {
    memberId: memberRow.id as string,
    email,
    customerId: customer.id,
    subscriptionId: sub.id,
    expectedMatches: price.recurring?.interval_count ?? 1,
  };
}

async function seedCancelingCandidate() {
  const tag = crypto.randomUUID().slice(0, 8);
  const email = `amsterdamparentproject+renewcheck-smoketest-canceling-${tag}@gmail.com`;

  const customer = await stripe.customers.create({
    email,
    name: "Renew-Check Smoketest (canceling)",
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });

  const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`Price with lookup key "${LOOKUP_KEY}" not found in Stripe test mode — has it been created?`);

  // Same 30-day trial as the billable candidate — irrelevant to the cancel
  // path either way, but keeps both candidates symmetric and avoids an
  // incidental invoice muddying the "no invoice was created" assertion
  // below.
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });

  const { data: memberRow, error: memberError } = await supabase
    .from("members")
    .insert({
      email,
      first_name: "Renew-Check",
      last_name: "Smoketest (canceling)",
      status: "canceling",
      stripe_customer_id: customer.id,
      consecutive_skips: 0,
      matches_remaining: 0,
    })
    .select("id")
    .single();
  if (memberError || !memberRow) throw new Error(`Member insert failed: ${memberError?.message}`);

  const { error: subError } = await supabase.from("subscriptions").insert({
    member_id: memberRow.id,
    stripe_subscription_id: sub.id,
    stripe_price_id: price.id,
    status: "active",
  });
  if (subError) throw new Error(`Subscription insert failed: ${subError.message}`);

  return {
    memberId: memberRow.id as string,
    email,
    customerId: customer.id,
    subscriptionId: sub.id,
  };
}

async function cleanup(candidates: Array<{ memberId: string; customerId: string; subscriptionId: string }>) {
  console.log("\nCleaning up...");
  for (const candidate of candidates) {
    try {
      await stripe.subscriptions.cancel(candidate.subscriptionId);
    } catch {
      // Already canceled (expected for the canceling candidate) — ignore
    }
    try {
      await stripe.customers.del(candidate.customerId);
    } catch {
      // Already deleted, or Stripe refuses (has other objects attached) — not worth failing the script over
    }
    await supabase.from("subscriptions").delete().eq("member_id", candidate.memberId);
    await supabase.from("members").delete().eq("id", candidate.memberId);
  }
  console.log("Done — seeded members, subscriptions, and Stripe test objects removed.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Smoke-testing POST ${BASE_URL}/api/renew-check\n`);

  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("Missing MATCHER_API_SECRET in .env.local");
    process.exit(1);
  }

  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(3_000) });
  } catch {
    console.error(`Can't reach ${BASE_URL} — is \`yarn dev -p 3001\` running?`);
    process.exit(1);
  }

  await reportExistingCandidates();

  console.log("Seeding one billable member (real Stripe test subscription + card on file, status=active, matches_remaining=0)...");
  const billable = await seedBillableCandidate();
  console.log(`  member ${billable.memberId} (${billable.email})`);
  console.log(`  subscription ${billable.subscriptionId}, expecting +${billable.expectedMatches} on credit\n`);

  console.log("Seeding one billable member whose card lives only on the subscription, not the customer (regression test for the 2026-09-11 payment-method-guard bug)...");
  const subLevelCard = await seedSubscriptionLevelCardCandidate();
  console.log(`  member ${subLevelCard.memberId} (${subLevelCard.email})`);
  console.log(`  subscription ${subLevelCard.subscriptionId}, expecting +${subLevelCard.expectedMatches} on credit (must NOT be skipped as no-payment-method)\n`);

  console.log("Seeding one canceling member (already declined to renew, status=canceling, matches_remaining=0)...");
  const canceling = await seedCancelingCandidate();
  console.log(`  member ${canceling.memberId} (${canceling.email})`);
  console.log(`  subscription ${canceling.subscriptionId}, expecting an explicit cancel — no invoice\n`);

  // Stripe creates its own $0 invoice (billing_reason=subscription_create)
  // the moment a trialing subscription is created, independent of anything
  // renew-check does — captured here so the "no invoice" check below only
  // flags invoices renew-check itself caused, not this pre-existing one.
  const invoicesBeforeCancel = await stripe.invoices.list({ customer: canceling.customerId, limit: 10 });
  const preexistingInvoiceIds = new Set(invoicesBeforeCancel.data.map((inv) => inv.id));

  let passed = true;
  const candidates = [billable, subLevelCard, canceling];

  try {
    console.log("Calling /api/renew-check...");
    const res = await fetch(`${BASE_URL}/api/renew-check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json();
    console.log(`  ${res.status} ${JSON.stringify(body)}\n`);
    if (!res.ok) {
      console.error("FAIL: renew-check did not return 2xx.");
      passed = false;
    }
    if (typeof body.canceled === "number" && body.canceled < 1) {
      console.error("FAIL: expected renew-check to report at least one cancellation.");
      passed = false;
    }

    console.log("Polling for the billable member's webhook credit (needs `stripe listen` running — up to ~20s)...");
    let matchesRemaining: number | null = null;
    for (const delayMs of [500, 500, 1000, 1000, 2000, 2000, 3000, 3000, 3000, 3000]) {
      await sleep(delayMs);
      const { data } = await supabase.from("members").select("matches_remaining").eq("id", billable.memberId).single();
      matchesRemaining = data?.matches_remaining ?? null;
      if ((matchesRemaining ?? 0) >= billable.expectedMatches) break;
    }
    if (matchesRemaining === billable.expectedMatches) {
      console.log(`  PASS: matches_remaining credited to ${matchesRemaining} as expected.`);
    } else {
      console.error(`  FAIL: expected matches_remaining=${billable.expectedMatches}, got ${matchesRemaining}. Is \`stripe listen\` running and forwarding to localhost:3001/api/webhooks/stripe?`);
      passed = false;
    }

    console.log("Checking the billable subscription was re-paused after crediting (Track E2)...");
    const finalSub = await stripe.subscriptions.retrieve(billable.subscriptionId);
    if (finalSub.pause_collection?.behavior === "void") {
      console.log("  PASS: pause_collection is set again.");
    } else {
      console.error(`  FAIL: expected pause_collection.behavior === "void", got ${JSON.stringify(finalSub.pause_collection)}.`);
      passed = false;
    }

    console.log("Polling for the subscription-level-card member's webhook credit (regression check — the guard must not skip this as no-payment-method)...");
    let subLevelMatchesRemaining: number | null = null;
    for (const delayMs of [500, 500, 1000, 1000, 2000, 2000, 3000, 3000, 3000, 3000]) {
      await sleep(delayMs);
      const { data } = await supabase.from("members").select("matches_remaining").eq("id", subLevelCard.memberId).single();
      subLevelMatchesRemaining = data?.matches_remaining ?? null;
      if ((subLevelMatchesRemaining ?? 0) >= subLevelCard.expectedMatches) break;
    }
    if (subLevelMatchesRemaining === subLevelCard.expectedMatches) {
      console.log(`  PASS: matches_remaining credited to ${subLevelMatchesRemaining} as expected — a subscription-level-only card was correctly billed.`);
    } else {
      console.error(`  FAIL: expected matches_remaining=${subLevelCard.expectedMatches}, got ${subLevelMatchesRemaining}. If this is 0, the payment-method guard is (again) treating a subscription-level card as "no payment method" and silently skipping the bill.`);
      passed = false;
    }

    console.log("Checking the subscription-level-card member's subscription was re-paused after crediting (Track E2)...");
    const subLevelFinalSub = await stripe.subscriptions.retrieve(subLevelCard.subscriptionId);
    if (subLevelFinalSub.pause_collection?.behavior === "void") {
      console.log("  PASS: pause_collection is set again.");
    } else {
      console.error(`  FAIL: expected pause_collection.behavior === "void", got ${JSON.stringify(subLevelFinalSub.pause_collection)}.`);
      passed = false;
    }

    console.log("Checking the canceling member's Stripe subscription was actually canceled...");
    const canceledSub = await stripe.subscriptions.retrieve(canceling.subscriptionId);
    if (canceledSub.status === "canceled") {
      console.log("  PASS: Stripe subscription status is canceled.");
    } else {
      console.error(`  FAIL: expected status "canceled", got "${canceledSub.status}".`);
      passed = false;
    }

    console.log("Checking no invoice was created by the cancellation itself...");
    const invoices = await stripe.invoices.list({ customer: canceling.customerId, limit: 10 });
    const newInvoices = invoices.data.filter((inv) => !preexistingInvoiceIds.has(inv.id));
    if (newInvoices.length === 0) {
      console.log("  PASS: no new invoice created.");
    } else {
      console.error(`  FAIL: expected 0 new invoices from the cancellation, found ${newInvoices.length}.`);
      for (const inv of newInvoices) {
        console.error(`    ${inv.id} — status=${inv.status}, total=${inv.total}, billing_reason=${inv.billing_reason}, paid=${inv.paid}`);
      }
      passed = false;
    }

    console.log("Polling for the webhook to mark the canceling member inactive (needs `stripe listen` running — up to ~20s)...");
    let cancelingStatus: string | null = null;
    for (const delayMs of [500, 500, 1000, 1000, 2000, 2000, 3000, 3000, 3000, 3000]) {
      await sleep(delayMs);
      const { data } = await supabase.from("members").select("status").eq("id", canceling.memberId).single();
      cancelingStatus = data?.status ?? null;
      if (cancelingStatus === "inactive") break;
    }
    if (cancelingStatus === "inactive") {
      console.log("  PASS: members.status is inactive.");
    } else {
      console.error(`  FAIL: expected members.status "inactive", got "${cancelingStatus}". Is \`stripe listen\` running and forwarding to localhost:3001/api/webhooks/stripe?`);
      passed = false;
    }
  } finally {
    await cleanup(candidates);
  }

  console.log(passed ? "\n✓ Smoke test passed." : "\n✗ Smoke test FAILED — see above.");
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
