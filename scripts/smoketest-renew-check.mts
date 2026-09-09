/**
 * Manual smoke test for POST /api/renew-check (Track E1) against a real
 * local dev server + real Stripe test mode — not a vitest/CI test, since
 * this needs `yarn dev` and `stripe listen` running as separate long-lived
 * processes. Seeds one throwaway billable member (real Stripe test
 * subscription, real card on file, matches_remaining forced to 0), calls
 * the route, confirms the full loop actually happened — pause_collection
 * cleared, invoice created, invoice.payment_succeeded webhook credited the
 * counter and re-paused the subscription — then cleans up after itself.
 *
 * Prerequisites (see __claude__/billing-simplification-plan.md and this
 * script's own preflight checks):
 *   1. `yarn dev -p 3001` running in one terminal
 *   2. `stripe listen --forward-to localhost:3001/api/webhooks/stripe`
 *      running in another (required for the webhook credit + re-pause to
 *      actually fire — without it this script will see `billed: 1` from
 *      renew-check itself but time out waiting for matches_remaining to
 *      update, since nothing delivers the invoice.payment_succeeded event)
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
 * their real (salvaged) Stripe subscriptions get paused/invoiced too, not
 * just their DB row — which `yarn seed-test-members` only resets the DB
 * side of. This script reports who else currently matches before running,
 * and reminds you to re-run `yarn seed-test-members` afterward regardless.
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
    console.log("Preflight: no other billable-at-zero members exist right now — this run will only touch the one seeded below.\n");
    return;
  }
  console.log(`Preflight: ${data.length} other member(s) already match renew-check's candidate filter and will ALSO be processed:`);
  for (const m of data) {
    console.log(`  - ${m.email} (${m.id}) — status=${m.status}, matches_remaining=${m.matches_remaining}`);
  }
  console.log("Harmless in Stripe test mode, but run `yarn seed-test-members` after this finishes to restore them.\n");
}

// ---------------------------------------------------------------------------
// Seed one throwaway billable member with a real Stripe test subscription
// and a real card on file (required — renew-check skips anyone with no
// default_payment_method).
// ---------------------------------------------------------------------------

async function seedCandidate() {
  const tag = crypto.randomUUID().slice(0, 8);
  const email = `amsterdamparentproject+renewcheck-smoketest-${tag}@gmail.com`;

  const customer = await stripe.customers.create({
    email,
    name: "Renew-Check Smoketest",
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
      last_name: "Smoketest",
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

async function cleanup(candidate: { memberId: string; customerId: string; subscriptionId: string }) {
  console.log("\nCleaning up...");
  try {
    await stripe.subscriptions.cancel(candidate.subscriptionId);
  } catch {
    // Already canceled — ignore
  }
  try {
    await stripe.customers.del(candidate.customerId);
  } catch {
    // Already deleted, or Stripe refuses (has other objects attached) — not worth failing the script over
  }
  await supabase.from("subscriptions").delete().eq("member_id", candidate.memberId);
  await supabase.from("members").delete().eq("id", candidate.memberId);
  console.log("Done — seeded member, subscription, and Stripe test objects removed.");
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

  console.log("Seeding one throwaway billable member (real Stripe test subscription + card on file, matches_remaining=0)...");
  const candidate = await seedCandidate();
  console.log(`  member ${candidate.memberId} (${candidate.email})`);
  console.log(`  subscription ${candidate.subscriptionId}, expecting +${candidate.expectedMatches} on credit\n`);

  let passed = true;

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

    console.log("Polling for the webhook credit (needs `stripe listen` running — up to ~20s)...");
    let matchesRemaining: number | null = null;
    for (const delayMs of [500, 500, 1000, 1000, 2000, 2000, 3000, 3000, 3000, 3000]) {
      await sleep(delayMs);
      const { data } = await supabase.from("members").select("matches_remaining").eq("id", candidate.memberId).single();
      matchesRemaining = data?.matches_remaining ?? null;
      if ((matchesRemaining ?? 0) >= candidate.expectedMatches) break;
    }
    if (matchesRemaining === candidate.expectedMatches) {
      console.log(`  PASS: matches_remaining credited to ${matchesRemaining} as expected.`);
    } else {
      console.error(`  FAIL: expected matches_remaining=${candidate.expectedMatches}, got ${matchesRemaining}. Is \`stripe listen\` running and forwarding to localhost:3001/api/webhooks/stripe?`);
      passed = false;
    }

    console.log("Checking the subscription was re-paused after crediting (Track E2)...");
    const finalSub = await stripe.subscriptions.retrieve(candidate.subscriptionId);
    if (finalSub.pause_collection?.behavior === "void") {
      console.log("  PASS: pause_collection is set again.");
    } else {
      console.error(`  FAIL: expected pause_collection.behavior === "void", got ${JSON.stringify(finalSub.pause_collection)}.`);
      passed = false;
    }
  } finally {
    await cleanup(candidate);
  }

  console.log(passed ? "\n✓ Smoke test passed." : "\n✗ Smoke test FAILED — see above.");
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
