/**
 * Track D rehearsal (billing-simplification-plan.md, §"Track D — rehearsal
 * (gates Track E)"). Runs cases 1-5 of the plan's 7-case table against a
 * Stripe test clock in the sandbox account:
 *
 *   1. Resume generates *and finalizes* an invoice immediately — the claim
 *      everything rests on.
 *   2. auto_advance on the resumption invoice.
 *   3. Failed resume leaves the subscription `paused`, not `past_due`.
 *   4. Pause-after-payment creates no proration credit.
 *   5. `billing_cycle_anchor: "now"` gives a clean term (no proration lines).
 *
 * Case 6 (SEPA's async settlement) and case 7 (portal doesn't offer resume
 * on a paused sub) are deliberately NOT in this script:
 *   - Case 7 is already answered — the account's default portal config has
 *     subscription_pause.enabled: false (confirmed directly via the Stripe
 *     API during Track C3, and again in this account for the sandbox).
 *   - Case 6 needs a SEPA test mandate/PaymentMethod flow, materially more
 *     involved than a card PM and worth its own script once 1-5 are
 *     confirmed working end-to-end — see plan Appendix / Track D notes.
 *
 * This script is UNTESTED by the author (this session's tools can reach
 * neither Supabase nor api.stripe.com directly — see Appendix A) — it's
 * built from the Stripe API's documented shapes and the installed SDK's
 * own type declarations, but it has never actually been run. Expect to
 * paste back whatever error surfaces on the first run so it can be fixed;
 * that's the normal way this migration's DB/Stripe-touching work has been
 * confirmed all along, not a special caveat for this file.
 *
 * Deliberately mirrors the *actual* pause/resume mechanism this app uses —
 * pause_collection with behavior: "void" and an explicit resumes_at (see
 * app/actions/skip.ts, lib/free-month-grants.ts) — not a hypothetical one,
 * so what this rehearses is what Track E would actually call.
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

async function getPriceId(): Promise<string> {
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    throw new Error(`No active price found for lookup_key "${lookupKey}" in this account.`);
  }
  return price.id;
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

// ---------------------------------------------------------------------------
// Cases 1 & 2 — does resume generate *and finalize* an invoice immediately,
// and what's auto_advance on it?
// ---------------------------------------------------------------------------
async function casesOneAndTwo(priceId: string) {
  const label = "case 1+2";
  const clock = await newClock("rehearse-cases-1-2");
  const customer = await newCustomerOnClock(clock.id, `d-rehearsal-1-2+${clock.id}@example.test`, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  log(label, `subscription ${sub.id} created, status=${sub.status}`);

  const clockNow = clock.frozen_time;
  const resumesAt = clockNow + 2 * DAY;

  await stripe.subscriptions.update(sub.id, {
    pause_collection: { behavior: "void", resumes_at: resumesAt },
  });
  log(label, `paused (void), resumes_at=${new Date(resumesAt * 1000).toISOString()}`);

  // Advance well past resumes_at — invoice finalization can lag the
  // triggering event by up to ~1 hour of clock time even inside a test
  // clock, per Stripe's own test-clock guidance.
  const checkpoint = resumesAt + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);
  log(label, `clock advanced to ${new Date(checkpoint * 1000).toISOString()}`);

  const freshInvoices = await newestInvoicesSince(customer.id, resumesAt, label);
  const resumeInvoice = freshInvoices.find((inv) => inv.status !== "draft") ?? freshInvoices[0];

  if (!resumeInvoice) {
    log(label, "✗ CASE 1 FAILED: no invoice was generated at all after resumes_at.");
  } else if (resumeInvoice.status === "draft") {
    log(label, `✗ CASE 1 FAILED: invoice ${resumeInvoice.id} exists but is still "draft" — not finalized.`);
  } else {
    log(label, `✓ CASE 1: invoice ${resumeInvoice.id} was generated and finalized (status=${resumeInvoice.status}).`);
    log(label, `  CASE 2: auto_advance=${resumeInvoice.auto_advance}`);
  }

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  log(label, `subscription status after resume: ${subAfter.status}`);
}

// ---------------------------------------------------------------------------
// Case 3 — failed resume: does the subscription land in "paused" or
// "past_due"? This is the failure mode Track E's design relies on.
// ---------------------------------------------------------------------------
async function caseThree(priceId: string) {
  const label = "case 3";
  const clock = await newClock("rehearse-case-3");
  const customer = await newCustomerOnClock(clock.id, `d-rehearsal-3+${clock.id}@example.test`, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  log(label, `subscription ${sub.id} created, status=${sub.status}`);

  // Swap the default payment method to one that attaches fine but declines
  // on every subsequent charge attempt — simulates a real member's card
  // silently going bad between paying today and their resume charge later.
  const badPm = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: badPm.id },
  });
  log(label, `swapped default payment method to a will-fail-to-charge card (${badPm.id})`);

  const clockNow = clock.frozen_time;
  const resumesAt = clockNow + 2 * DAY;
  await stripe.subscriptions.update(sub.id, {
    pause_collection: { behavior: "void", resumes_at: resumesAt },
  });
  log(label, `paused (void), resumes_at=${new Date(resumesAt * 1000).toISOString()}`);

  const checkpoint = resumesAt + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  const freshInvoices = await newestInvoicesSince(customer.id, resumesAt, label);

  if (subAfter.status === "paused") {
    log(label, `✓ CASE 3: subscription stayed "paused" after the resume charge failed (as the plan assumes).`);
  } else if (subAfter.status === "past_due") {
    log(label, `✗ CASE 3: subscription is "past_due", NOT "paused" — the plan's assumed failure mode is wrong. This needs a design change before Track E.`);
  } else {
    log(label, `? CASE 3: subscription status is "${subAfter.status}" — neither of the two outcomes the plan considered. Needs a look.`);
  }
  log(label, `(for reference: ${freshInvoices.length} invoice(s) generated around the failed resume)`);
}

// ---------------------------------------------------------------------------
// Case 4 — pausing right after a payment: does it create a proration
// credit that shouldn't exist? (pause_collection is designed not to
// prorate already-invoiced time — this confirms that's actually true here.)
// ---------------------------------------------------------------------------
async function caseFour(priceId: string) {
  const label = "case 4";
  const clock = await newClock("rehearse-case-4");
  const customer = await newCustomerOnClock(clock.id, `d-rehearsal-4+${clock.id}@example.test`, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  log(label, `subscription ${sub.id} created, status=${sub.status}`);

  const balanceBefore = (await stripe.customers.retrieve(customer.id) as { balance: number }).balance;

  // Pause immediately after the initial payment succeeds — the scenario
  // that would reveal an unwanted proration credit, if pause_collection
  // created one the way canceling or downgrading mid-cycle does.
  await stripe.subscriptions.update(sub.id, {
    pause_collection: { behavior: "void", resumes_at: clock.frozen_time + 30 * DAY },
  });
  log(label, "paused immediately after initial payment");

  const balanceAfter = (await stripe.customers.retrieve(customer.id) as { balance: number }).balance;
  const creditNotes = await stripe.creditNotes.list({ customer: customer.id, limit: 5 });

  log(label, `customer.balance before=${balanceBefore}, after=${balanceAfter}`);
  log(label, `credit notes issued: ${creditNotes.data.length}`);

  if (balanceAfter === balanceBefore && creditNotes.data.length === 0) {
    log(label, "✓ CASE 4: no proration credit appeared from pausing right after payment.");
  } else {
    log(label, "✗ CASE 4: something changed the customer's balance or issued a credit note — look closer before relying on this in Track E.");
  }
}

// ---------------------------------------------------------------------------
// Case 5 — billing_cycle_anchor: "now" with proration_behavior: "none":
// does it give a clean term with no proration line items?
// ---------------------------------------------------------------------------
async function caseFive(priceId: string) {
  const label = "case 5";
  const clock = await newClock("rehearse-case-5");
  const customer = await newCustomerOnClock(clock.id, `d-rehearsal-5+${clock.id}@example.test`, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  log(label, `subscription ${sub.id} created, status=${sub.status}`);

  const markerTime = clock.frozen_time;
  await stripe.subscriptions.update(sub.id, {
    billing_cycle_anchor: "now",
    proration_behavior: "none",
  });
  log(label, "updated with billing_cycle_anchor: now, proration_behavior: none");

  const freshInvoices = await newestInvoicesSince(customer.id, markerTime, label);
  // Where "is this a proration" actually lives varies by which parent
  // generated the line item (a subscription item vs. a standalone invoice
  // item) — check both rather than assuming one shape.
  const prorationLines = await Promise.all(
    freshInvoices.map(async (inv) => {
      const full = await stripe.invoices.retrieve(inv.id!, { expand: ["lines"] });
      return full.lines.data.filter(
        (line) =>
          line.parent?.invoice_item_details?.proration ||
          line.parent?.subscription_item_details?.proration
      );
    })
  );
  const totalProrationLines = prorationLines.reduce((sum, lines) => sum + lines.length, 0);

  if (totalProrationLines === 0) {
    log(label, "✓ CASE 5: no proration line items after billing_cycle_anchor: now with proration_behavior: none.");
  } else {
    log(label, `✗ CASE 5: found ${totalProrationLines} proration line item(s) — not the clean term the plan assumes.`);
  }

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  log(label, `new current_period_end: ${new Date(subAfter.items.data[0].current_period_end * 1000).toISOString()}`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Track D rehearsal — plan: ${lookupKey}\n`);
  const priceId = await getPriceId();
  log("setup", `resolved lookup_key "${lookupKey}" → price ${priceId}`);

  const cases: Array<[string, () => Promise<void>]> = [
    ["cases 1+2", () => casesOneAndTwo(priceId)],
    ["case 3", () => caseThree(priceId)],
    ["case 4", () => caseFour(priceId)],
    ["case 5", () => caseFive(priceId)],
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
