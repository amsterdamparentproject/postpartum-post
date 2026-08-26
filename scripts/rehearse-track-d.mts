/**
 * Track D rehearsal (billing-simplification-plan.md, §"Track D — rehearsal
 * (gates Track E)"). Runs cases 1-5 of the plan's 7-case table against a
 * Stripe test clock in the sandbox account.
 *
 * v4 — the mechanism changed, not just the test. v1-v3 were built around
 * Stripe's dedicated `subscriptions.pause`/`.resume` endpoints (plan §6
 * used to read "Pause/resume endpoints, not pause_collection"). Checking
 * that assumption (2026-08-26) turned up that the *pause* half of that
 * pair requires API version 2025-06-30.preview or later and isn't in the
 * installed SDK (stripe-node 22.1.1 has `resume()` and
 * `SubscriptionResumeParams` — added years ago for the unrelated
 * "trial ended with no payment method" auto-pause — but no `pause()`
 * method or params at all), isn't in the Stripe MCP's operation catalog,
 * and every API reference link on Stripe's own "Pause subscriptions" docs
 * page is suffixed `.preview`. It's been sitting in preview since mid-2025
 * across several monthly version bumps without graduating, so it's not
 * just newly-announced — treat it as still actively changing. Confirmed
 * via WebFetch of docs.stripe.com/billing/subscriptions/pause and
 * /pause-payment, cross-checked against the installed SDK's own .d.ts
 * files and CHANGELOG.md.
 *
 * Decision (plan §6, revised 2026-08-26): stay on `pause_collection` (what
 * this app already calls in app/actions/skip.ts, lib/free-month-grants.ts)
 * and build the refill charge explicitly — `invoiceItems.create()` then
 * `invoices.create()` — rather than waiting on the dedicated pause/resume
 * pair. Revisit at GA: it would collapse Track E's E2 refill step from a
 * two-call manual construction into one `subscriptions.resume()` call.
 *
 *   1. Clearing pause_collection alone does NOT bill anything — confirms
 *      the negative, since Track E must not accidentally rely on this.
 *   2. The manually-built refill invoice (invoiceItems.create +
 *      invoices.create) reaches "paid" on its own.
 *   3. A card that fails on that invoice leaves the subscription/invoice
 *      in a state Track E's renew-check job can actually detect — there's
 *      no dedicated `paused` status to fall back on with this mechanism,
 *      so this case is about finding out what the real signal is.
 *   4. Pausing right after payment creates no stray invoice or proration
 *      credit while paused.
 *   5. The manually-built invoice's amount matches the plan price exactly,
 *      with no proration line item sneaking in.
 *
 * Case 6 (SEPA's async settlement) and case 7 (portal doesn't offer pause
 * to a member) are deliberately NOT in this script:
 *   - Case 7 is already answered — the account's default portal config has
 *     subscription_pause.enabled: false (confirmed directly via the Stripe
 *     API during Track C3, and again in this account for the sandbox).
 *     That's the portal's own, separate, deprecated self-serve pause
 *     toggle — unrelated to the pause/resume endpoint question above.
 *   - Case 6 needs a SEPA test mandate/PaymentMethod flow, materially more
 *     involved than a card PM and worth its own script once 1-5 are
 *     confirmed working end-to-end.
 *
 * This script is UNTESTED by the author (this session's tools can reach
 * neither Supabase nor api.stripe.com directly — see Appendix A) — it's
 * built from the Stripe API's documented shapes and the installed SDK's
 * own type declarations, but it has never actually been run. Expect to
 * paste back whatever error surfaces on the first run so it can be fixed;
 * that's the normal way this migration's DB/Stripe-touching work has been
 * confirmed all along, not a special caveat for this file.
 *
 * Usage:
 *   yarn rehearse-track-d                    # defaults to commitment_3mo
 *   yarn rehearse-track-d standard_monthly   # rehearse against another plan
 *
 * Always runs against .env.local, which (confirmed 2026-08-26) already
 * points at the Amsterdam Parent Project sandbox account, not production —
 * this script creates real (sandbox) test clocks, customers and
 * subscriptions and never touches Supabase, but double check your
 * STRIPE_SECRET_KEY before running if you've changed .env.local since.
 *
 * Everything this script creates is tagged and left behind for inspection
 * in the sandbox Dashboard (Developers → Test clocks) — it doesn't clean
 * up after itself. Test clocks auto-delete after a few days of inactivity.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const { getStripe } = await import("../lib/stripe.ts");
const stripe = getStripe();

const lookupKey = process.argv[2] ?? "commitment_3mo";
const DAY = 24 * 60 * 60;

function log(label: string, ...rest: unknown[]) {
  console.log(`[${label}]`, ...rest);
}

async function pollClockReady(clockId: string, label: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === "ready") return;
    if (clock.status === "internal_failure") {
      throw new Error(`[${label}] test clock ${clockId} hit internal_failure`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`[${label}] test clock ${clockId} never reached "ready" after 2 minutes of polling`);
}

async function advanceClock(clockId: string, toUnix: number, label: string): Promise<void> {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: toUnix });
  await pollClockReady(clockId, label);
}

async function getPriceId(): Promise<{ id: string; unitAmount: number | null }> {
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    throw new Error(`No active price found for lookup_key "${lookupKey}" in this account.`);
  }
  return { id: price.id, unitAmount: price.unit_amount };
}

async function newClock(name: string) {
  const now = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name });
  log(name, `clock created: ${clock.id}, frozen at ${new Date(now * 1000).toISOString()}`);
  return clock;
}

async function newCustomerOnClock(clockId: string, email: string, paymentMethod: string) {
  const customer = await stripe.customers.create({
    email,
    test_clock: clockId,
    payment_method: paymentMethod,
    invoice_settings: { default_payment_method: paymentMethod },
  });
  return customer;
}

async function newSubscription(customerId: string, priceId: string) {
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice"],
  });
  return sub;
}

async function newestInvoicesSince(customerId: string, sinceUnix: number, label: string) {
  const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 });
  const fresh = invoices.data.filter((inv) => inv.created >= sinceUnix);
  log(label, `${fresh.length} invoice(s) since ${new Date(sinceUnix * 1000).toISOString()}`);
  for (const inv of fresh) {
    log(
      label,
      `  invoice ${inv.id}: status=${inv.status} auto_advance=${inv.auto_advance} amount_due=${inv.amount_due} created=${new Date(inv.created * 1000).toISOString()}`
    );
  }
  return fresh;
}

/** Builds a fresh subscription, pauses it open-ended (void, no resumes_at —
 * Track E always resumes explicitly, never via Stripe's own scheduled
 * clear), and advances the clock past its natural period end while still
 * paused. Shared setup for cases 1-3, which all start from "a member
 * coasting past their normal billing date on banked matches." */
async function pausedPastNaturalEnd(priceId: string, label: string, emailTag: string) {
  const clock = await newClock(`rehearse-${emailTag}`);
  const customer = await newCustomerOnClock(clock.id, `d-rehearsal-${emailTag}+${clock.id}@example.test`, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  const naturalPeriodEnd = sub.items.data[0].current_period_end;
  log(label, `subscription ${sub.id} created, status=${sub.status}, natural current_period_end=${new Date(naturalPeriodEnd * 1000).toISOString()}`);

  await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "void" } });
  log(label, "paused (void), open-ended — no resumes_at");

  const pastNaturalEnd = naturalPeriodEnd + DAY;
  await advanceClock(clock.id, pastNaturalEnd, label);
  const invoicesWhilePaused = await newestInvoicesSince(customer.id, naturalPeriodEnd, label);
  // behavior: "void" is documented to let Stripe generate the invoice at
  // the natural boundary and then auto-void it — that's correct pause
  // behavior, not a problem. Only a non-void invoice here (something
  // actually charged, or left draft/open) would be a red flag.
  const chargedWhilePaused = invoicesWhilePaused.filter((inv) => inv.status !== "void");
  if (chargedWhilePaused.length > 0) {
    log(label, `⚠ ${chargedWhilePaused.length} non-void invoice(s) appeared while still paused, past the natural period end — pause_collection may not be voiding as expected.`);
  } else if (invoicesWhilePaused.length > 0) {
    log(label, `confirmed: ${invoicesWhilePaused.length} invoice(s) appeared at the natural boundary while paused, correctly voided (behavior: "void" working as documented).`);
  } else {
    log(label, "confirmed: nothing invoiced while paused, even past the natural period end.");
  }

  return { clock, customer, sub, pastNaturalEnd };
}

// ---------------------------------------------------------------------------
// Case 1 — does clearing pause_collection, by itself, bill anything?
// Track E must NOT accidentally depend on this — confirms the negative.
// ---------------------------------------------------------------------------
async function caseOne(priceId: string) {
  const label = "case 1";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEnd(priceId, label, "case-1");

  const resumeCalledAt = pastNaturalEnd;
  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  log(label, `cleared pause_collection at ${new Date(resumeCalledAt * 1000).toISOString()}`);

  // Invoice finalization can lag the triggering event by up to ~1 hour of
  // clock time even inside a test clock, per Stripe's own guidance.
  const checkpoint = resumeCalledAt + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const freshInvoices = await newestInvoicesSince(customer.id, resumeCalledAt, label);
  const billed = freshInvoices.find((inv) => inv.status !== "draft" && inv.status !== "void");

  if (!billed) {
    log(label, "✓ CASE 1: clearing pause_collection alone did not bill anything, as expected — Track E must build the refill invoice itself.");
  } else {
    log(label, `✗ CASE 1: invoice ${billed.id} (status=${billed.status}) appeared just from clearing pause_collection — that's a surprise worth understanding before Track E ships, since it changes what "just resume" would already do on its own.`);
  }

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  log(label, `subscription status after clearing pause_collection: ${subAfter.status}`);
}

// ---------------------------------------------------------------------------
// Case 2 — the manually-built refill invoice (invoiceItems.create +
// invoices.create) actually reaches "paid" on its own.
//
// invoices.create's own docs say a `subscription` param only pulls in that
// subscription's *pending* invoice items — it does NOT bill the
// subscription's own recurring price early. So the pattern is: create a
// pending invoice item for the price, then create+finalize an invoice that
// includes it. This is what Track E's refill step needs to do explicitly.
// ---------------------------------------------------------------------------
async function caseTwo(priceId: string) {
  const label = "case 2";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEnd(priceId, label, "case-2");

  const resumeCalledAt = pastNaturalEnd;
  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  log(label, `cleared pause_collection at ${new Date(resumeCalledAt * 1000).toISOString()}`);

  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    pricing: { price: priceId },
  });
  log(label, `created a pending invoice item (${item.id}) for the subscription's own price`);

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
    pending_invoice_items_behavior: "include",
  });
  log(label, `created invoice ${invoice.id}, status=${invoice.status}, auto_advance=${invoice.auto_advance}`);

  const checkpoint = resumeCalledAt + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const finalInvoice = await stripe.invoices.retrieve(invoice.id!);
  if (finalInvoice.status === "paid") {
    log(label, `✓ CASE 2: the manually-built refill invoice (${finalInvoice.id}) reached "paid" on its own.`);
  } else {
    log(label, `✗ CASE 2: invoice ${finalInvoice.id} exists but status=${finalInvoice.status}, not "paid" — look closer at the Dashboard for this test clock (${clock.id}) before relying on this in Track E.`);
  }
}

// ---------------------------------------------------------------------------
// Case 3 — a card that fails on the manually-built refill invoice: what
// state does that leave things in? There's no dedicated `paused` status to
// fall back on with this mechanism (the subscription never leaves
// `active`), so this is about finding the real signal Track E's
// renew-check job needs to watch for — most likely the invoice's own
// status (`open` retrying, or `uncollectible`), not the subscription's.
// ---------------------------------------------------------------------------
async function caseThree(priceId: string) {
  const label = "case 3";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEnd(priceId, label, "case-3");

  // Swap the default payment method to one that attaches fine but declines
  // on every subsequent charge attempt — simulates a real member's card
  // silently going bad while they were coasting on banked matches.
  const badPm = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: badPm.id },
  });
  log(label, `swapped default payment method to a will-fail-to-charge card (${badPm.id})`);

  const resumeCalledAt = pastNaturalEnd;
  await stripe.subscriptions.update(sub.id, { pause_collection: null });

  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    pricing: { price: priceId },
  });
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
    pending_invoice_items_behavior: "include",
  });
  log(label, `created invoice ${invoice.id} against the bad card, item ${item.id}`);

  const checkpoint = resumeCalledAt + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  const finalInvoice = await stripe.invoices.retrieve(invoice.id!);

  log(label, `subscription status after the failed charge: ${subAfter.status}`);
  log(label, `invoice status after the failed charge: ${finalInvoice.status} (attempted=${finalInvoice.attempted}, attempt_count=${finalInvoice.attempt_count})`);

  if (subAfter.status === "active" && (finalInvoice.status === "open" || finalInvoice.status === "uncollectible")) {
    log(label, `✓ CASE 3: subscription stays "active" (as expected — pause_collection was already cleared, and this mechanism never sets a subscription-level "paused" status); invoice status "${finalInvoice.status}" is the real signal Track E's renew-check job should watch for a stuck refill, not subscription.status.`);
  } else {
    log(label, `? CASE 3: subscription=${subAfter.status}, invoice=${finalInvoice.status} — doesn't match the expected shape above. Needs a look before Track E's failure-detection design is finalized.`);
  }
}

// ---------------------------------------------------------------------------
// Case 4 — pausing right after a payment: does it create a proration
// credit or a stray invoice that shouldn't exist? (pause_collection is
// designed not to prorate already-invoiced time — this confirms that's
// actually true here, open-ended, matching Track E's own pattern.)
// ---------------------------------------------------------------------------
async function caseFour(priceId: string) {
  const label = "case 4";
  const clock = await newClock("rehearse-case-4");
  const customer = await newCustomerOnClock(clock.id, `d-rehearsal-4+${clock.id}@example.test`, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  log(label, `subscription ${sub.id} created, status=${sub.status}`);

  const balanceBefore = (await stripe.customers.retrieve(customer.id) as { balance: number }).balance;

  // Pause immediately after the initial payment succeeds, open-ended (no
  // resumes_at) — the exact pattern Track E's E2 uses.
  await stripe.subscriptions.update(sub.id, {
    pause_collection: { behavior: "void" },
  });
  log(label, "paused (void), open-ended, immediately after initial payment");

  const balanceAfter = (await stripe.customers.retrieve(customer.id) as { balance: number }).balance;
  const creditNotes = await stripe.creditNotes.list({ customer: customer.id, limit: 5 });
  const strayInvoices = await newestInvoicesSince(customer.id, sub.created + 1, label);

  log(label, `customer.balance before=${balanceBefore}, after=${balanceAfter}`);
  log(label, `credit notes issued: ${creditNotes.data.length}`);

  if (balanceAfter === balanceBefore && creditNotes.data.length === 0 && strayInvoices.length === 0) {
    log(label, "✓ CASE 4: no proration credit or stray invoice appeared from pausing right after payment.");
  } else {
    log(label, "✗ CASE 4: something changed the customer's balance, issued a credit note, or generated a stray invoice — look closer before relying on this in Track E.");
  }
}

// ---------------------------------------------------------------------------
// Case 5 — the manually-built refill invoice's amount matches the plan
// price exactly, with no proration line item sneaking in. There's no
// billing_cycle_anchor/proration_behavior param to lean on with this
// mechanism (those belong to the dedicated resume endpoint we're not
// using) — the invoice item is created directly from the price, so this
// confirms that comes through clean.
// ---------------------------------------------------------------------------
async function caseFive(priceId: string, expectedUnitAmount: number | null) {
  const label = "case 5";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEnd(priceId, label, "case-5");

  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    pricing: { price: priceId },
  });
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
    pending_invoice_items_behavior: "include",
  });
  log(label, `created invoice ${invoice.id} from item ${item.id}`);

  const checkpoint = pastNaturalEnd + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const finalInvoice = await stripe.invoices.retrieve(invoice.id!, { expand: ["lines"] });
  const prorationLines = finalInvoice.lines.data.filter(
    (line) =>
      line.parent?.invoice_item_details?.proration ||
      line.parent?.subscription_item_details?.proration
  );

  log(label, `invoice total=${finalInvoice.total}, expected plan unit_amount=${expectedUnitAmount}, proration lines=${prorationLines.length}`);

  if (prorationLines.length === 0 && expectedUnitAmount !== null && finalInvoice.total === expectedUnitAmount) {
    log(label, "✓ CASE 5: refill invoice total matches the plan price exactly, no proration lines.");
  } else if (prorationLines.length === 0) {
    log(label, `? CASE 5: no proration lines, but total (${finalInvoice.total}) doesn't match expected (${expectedUnitAmount}) — worth a look (tax/discount could explain it).`);
  } else {
    log(label, `✗ CASE 5: found ${prorationLines.length} proration line item(s) — not the clean charge Track E assumes.`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Track D rehearsal — plan: ${lookupKey}\n`);
  const { id: priceId, unitAmount } = await getPriceId();
  log("setup", `resolved lookup_key "${lookupKey}" → price ${priceId} (unit_amount=${unitAmount})`);

  const cases: Array<[string, () => Promise<void>]> = [
    ["case 1", () => caseOne(priceId)],
    ["case 2", () => caseTwo(priceId)],
    ["case 3", () => caseThree(priceId)],
    ["case 4", () => caseFour(priceId)],
    ["case 5", () => caseFive(priceId, unitAmount)],
  ];

  for (const [name, run] of cases) {
    console.log(`\n--- ${name} ---`);
    try {
      await run();
    } catch (e) {
      console.error(`✗ ${name} threw:`, e instanceof Error ? e.message : e);
    }
  }

  console.log("\nDone. Inspect the sandbox Dashboard (Developers → Test clocks) for full detail on any case.");
}

main().catch((e) => {
  console.error("✗ Failed:", e?.message ?? e);
  process.exit(1);
});
