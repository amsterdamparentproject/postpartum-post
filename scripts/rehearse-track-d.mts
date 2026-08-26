/**
 * Track D rehearsal (billing-simplification-plan.md, §"Track D — rehearsal
 * (gates Track E)"). Runs cases 1-6 of the plan's 7-case table against a
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
 *   3. A card that fails on that invoice flips subscription.status to
 *      `past_due` — confirmed 2026-08-26 — a real, usable signal that
 *      maps directly onto the app's own `payment_failed` status.
 *   4. Pausing right after payment creates no stray invoice or proration
 *      credit while paused.
 *   5. The manually-built invoice's amount matches the plan price exactly,
 *      with no proration line item sneaking in.
 *   6. SEPA-funded refills: does the invoice settle on *submission* or on
 *      *settlement*, and does a failed SEPA charge leave the same
 *      `past_due` signal as case 3's card? Both matter because most
 *      members pay by SEPA (13 iDEAL→SEPA, 11 SEPA, vs 12 card).
 *
 * First real run (2026-08-26) surfaced one more thing: invoiceItems.create's
 * `pricing.price` param only accepts one-time prices — it rejects a
 * subscription's own recurring price with "this field only accepts prices
 * with type=one_time". Cases 2/3/5 now bill the same amount directly via
 * `amount` + `currency` instead of referencing the price by ID.
 *
 * Second real run surfaced another: invoices.create rejects
 * `pending_invoice_items_behavior` and `subscription` together ("You may
 * only specify one of these parameters"). Per the SDK's own doc comment,
 * `subscription` alone already means "include all pending invoice items
 * for that subscription" — the behavior flag was redundant. Dropped it.
 *
 * Output is now also written to scripts/rehearse-track-d.log (gitignored,
 * overwritten each run) alongside stdout, so results can be read back
 * directly from the repo instead of pasted from the terminal.
 *
 * Case 6 (SEPA's async settlement, added 2026-08-26) uses Stripe's test
 * IBANs for the Netherlands (docs.stripe.com/payments/sepa-debit/accept-a-
 * payment#test-integration) — NL55RABO0300065267 to force a real delayed
 * settlement (≥3 minutes of *wall-clock* time, not test-clock time — the
 * "processing → succeeded" simulation for async payment methods runs on a
 * real background timer independent of the customer's test clock) and
 * NL28RABO0300065268 to force a real delayed failure. Building a SEPA
 * PaymentMethod from a raw IBAN needs an explicit Mandate — there's no
 * browser in this script to run Stripe.js's confirmSepaDebitSetup, so this
 * uses the API-only path Stripe's own migration docs use for ACH mandates
 * collected outside Stripe.js (mandate_data.customer_acceptance.type:
 * "offline", via a SetupIntent): docs.stripe.com/payments/ach-direct-debit/
 * migrating-from-charges. That doc's example is ACH-specific — SEPA wasn't
 * separately confirmed to accept the same shape, but the second real run
 * (2026-08-26) got past the mandate SetupIntent cleanly, so this shape
 * appears to work for SEPA too. First real run hit an earlier issue
 * instead: `paymentMethods.create` for `sepa_debit` requires
 * `billing_details.email` (card PMs don't) — fixed by passing the
 * customer's own email through. Second real run then surfaced that the
 * invoice itself never left "draft" after 6 minutes of real-time polling —
 * auto_advance's finalization (draft → open → submitted) is scheduled
 * relative to the customer's TEST CLOCK, same as every other case's ~1
 * hour lag, not real time; only the SEPA settlement *after* submission
 * runs on a real background timer. Fixed by advancing the test clock (as
 * cases 1/2/3/5 already do) before polling for settlement.
 * Deliberately routes the subscription's own *initial* payment through the
 * card PM already on the customer, and only switches the default payment
 * method to SEPA before the refill — mirrors a real member's iDEAL-then-
 * SEPA path (the 13 iDEAL→SEPA members the plan already accounts for) and
 * keeps this case focused on what it's testing (the manually-built refill
 * invoice's behavior under SEPA), not the separate, already-well-trodden
 * question of an async *initial* subscription payment.
 *
 * Case 7 (portal doesn't offer resume on a paused sub) is deliberately NOT
 * in this script — it's already answered: the account's default portal
 * config has subscription_pause.enabled: false (confirmed directly via the
 * Stripe API during Track C3, and again in this account for the sandbox).
 * That's the portal's own, separate, deprecated self-serve pause toggle —
 * unrelated to the pause/resume endpoint question above.
 *
 * This script is UNTESTED by the author (this session's tools can reach
 * neither Supabase nor api.stripe.com directly — see Appendix A) — it's
 * built from the Stripe API's documented shapes and the installed SDK's
 * own type declarations, but it has never actually been run. Expect to
 * paste back whatever error surfaces on the first run so it can be fixed;
 * that's the normal way this migration's DB/Stripe-touching work has been
 * confirmed all along, not a special caveat for this file. Case 6
 * specifically can take several minutes of real wall-clock time to finish
 * (it polls for a real, simulated SEPA settlement delay) — cases 1-5 are
 * fast; don't be surprised if the run as a whole now takes 5-10 minutes.
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
import { writeFileSync, appendFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

// Mirror everything to a log file alongside stdout, so results can be read
// back from disk (e.g. via the device bridge) instead of pasted from the
// terminal. Overwritten at the start of each run.
const LOG_FILE = resolve(process.cwd(), "scripts/rehearse-track-d.log");
writeFileSync(LOG_FILE, "");
const rawLog = console.log.bind(console);
const rawError = console.error.bind(console);
function toLine(args: unknown[]): string {
  return args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === "string" ? a : JSON.stringify(a))).join(" ");
}
console.log = (...args: unknown[]) => {
  rawLog(...args);
  appendFileSync(LOG_FILE, toLine(args) + "\n");
};
console.error = (...args: unknown[]) => {
  rawError(...args);
  appendFileSync(LOG_FILE, toLine(args) + "\n");
};

const { getStripe } = await import("../lib/stripe.ts");
const stripe = getStripe();

const lookupKey = process.argv[2] ?? "commitment_3mo";
const DAY = 24 * 60 * 60;

// Stripe's test IBANs for the Netherlands (docs.stripe.com/payments/sepa-
// debit/accept-a-payment#test-integration). "Delayed" variants force a
// real (wall-clock, not test-clock) ≥3-minute processing window instead of
// resolving immediately — needed to actually observe the submission vs.
// settlement distinction case 6 is checking.
const SEPA_TEST_IBANS = {
  successDelayed: "NL55RABO0300065267", // processing → succeeded, ≥3 real minutes
  failedDelayed: "NL28RABO0300065268", // processing → requires_payment_method, ≥3 real minutes
};

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

/** Polls an invoice on REAL wall-clock time (not the test clock) until it
 * settles (paid/uncollectible/void) or maxWaitMs elapses, logging every
 * status change along the way. Async payment methods like SEPA resolve on
 * a real background timer in test mode ("about 3 minutes" per Stripe's own
 * testing docs) independent of the subscription's test clock, so this is
 * the only way to actually observe the submission → settlement gap. */
async function pollInvoiceUntilSettled(invoiceId: string, label: string, maxWaitMs: number, intervalMs: number) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < maxWaitMs) {
    const inv = await stripe.invoices.retrieve(invoiceId);
    const snapshot = `status=${inv.status} attempted=${inv.attempted} attempt_count=${inv.attempt_count}`;
    if (snapshot !== last) {
      log(label, `  t+${Math.round((Date.now() - start) / 1000)}s real time: ${snapshot}`);
      last = snapshot;
    }
    if (inv.status === "paid" || inv.status === "uncollectible" || inv.status === "void") {
      return inv;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  log(label, `⚠ gave up polling after ${Math.round(maxWaitMs / 1000)}s real time — still not settled`);
  return await stripe.invoices.retrieve(invoiceId);
}

async function getPriceId(): Promise<{ id: string; unitAmount: number | null; currency: string }> {
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    throw new Error(`No active price found for lookup_key "${lookupKey}" in this account.`);
  }
  return { id: price.id, unitAmount: price.unit_amount, currency: price.currency };
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

/** Builds a SEPA Direct Debit PaymentMethod from a test IBAN and attaches
 * it to the customer with a Mandate, via the API-only "offline" acceptance
 * path (no browser/Stripe.js in this script to collect it the normal way).
 * Confirmed for ACH (docs.stripe.com/payments/ach-direct-debit/migrating-
 * from-charges); NOT separately confirmed for SEPA — this is the most
 * likely first thing to need fixing once case 6 actually runs.
 *
 * First real run (2026-08-26): `paymentMethods.create` for `sepa_debit`
 * rejects a missing `billing_details.email` ("Missing required param:
 * billing_details[email]") — unlike card PMs, which don't need one. */
async function newSepaPaymentMethod(customerId: string, email: string, iban: string) {
  const pm = await stripe.paymentMethods.create({
    type: "sepa_debit",
    sepa_debit: { iban },
    billing_details: { name: "Track D Rehearsal", email },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.setupIntents.create({
    customer: customerId,
    payment_method: pm.id,
    payment_method_types: ["sepa_debit"],
    mandate_data: {
      customer_acceptance: {
        type: "offline",
        accepted_at: Math.floor(Date.now() / 1000),
      },
    },
    confirm: true,
  });
  return pm;
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

/** Same as pausedPastNaturalEnd, but the subscription's own initial payment
 * still goes through the card PM (mirrors a real member's iDEAL signup),
 * and the customer's default payment method is switched to a SEPA Direct
 * Debit PM (built from `iban`) right before pausing — so the manually-
 * built refill invoice case 6 tests is the one that actually goes through
 * SEPA. */
async function pausedPastNaturalEndSepa(priceId: string, label: string, emailTag: string, iban: string) {
  const clock = await newClock(`rehearse-${emailTag}`);
  const email = `d-rehearsal-${emailTag}+${clock.id}@example.test`;
  const customer = await newCustomerOnClock(clock.id, email, "pm_card_visa");
  const sub = await newSubscription(customer.id, priceId);
  const naturalPeriodEnd = sub.items.data[0].current_period_end;
  log(label, `subscription ${sub.id} created (card), status=${sub.status}, natural current_period_end=${new Date(naturalPeriodEnd * 1000).toISOString()}`);

  const sepaPm = await newSepaPaymentMethod(customer.id, email, iban);
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: sepaPm.id },
  });
  log(label, `switched default payment method to SEPA (${sepaPm.id}, iban ending ...${iban.slice(-4)})`);

  await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "void" } });
  log(label, "paused (void), open-ended — no resumes_at");

  const pastNaturalEnd = naturalPeriodEnd + DAY;
  await advanceClock(clock.id, pastNaturalEnd, label);

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
async function caseTwo(priceId: string, unitAmount: number, currency: string) {
  const label = "case 2";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEnd(priceId, label, "case-2");

  const resumeCalledAt = pastNaturalEnd;
  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  log(label, `cleared pause_collection at ${new Date(resumeCalledAt * 1000).toISOString()}`);

  // invoiceItems.create's `pricing.price` only accepts one-time prices —
  // it rejects the subscription's own recurring price with "this field
  // only accepts prices with type=one_time" (confirmed on the first real
  // run). Bill the same amount directly via amount + currency instead.
  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    amount: unitAmount,
    currency,
    description: `Track D rehearsal refill (${lookupKey})`,
  });
  log(label, `created a pending invoice item (${item.id}) for the subscription's own price`);

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
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
// state does that leave things in?
//
// Confirmed (2026-08-26, real run): subscription.status flips to
// `past_due`, even though this mechanism never touches pause_collection
// and isn't part of the subscription's natural billing cycle — Stripe
// treats any invoice linked via `subscription:` as part of that
// subscription's own dunning state. Reverses the original assumption (that
// only the invoice's own status would move) — past_due is a real, usable
// signal after all, and maps directly onto the app's own `payment_failed`
// status (plan §3.3's "0 | payment failed" row).
// ---------------------------------------------------------------------------
async function caseThree(priceId: string, unitAmount: number, currency: string) {
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
    amount: unitAmount,
    currency,
    description: `Track D rehearsal refill (${lookupKey})`,
  });
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
  });
  log(label, `created invoice ${invoice.id} against the bad card, item ${item.id}`);

  const checkpoint = resumeCalledAt + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  const finalInvoice = await stripe.invoices.retrieve(invoice.id!);

  log(label, `subscription status after the failed charge: ${subAfter.status}`);
  log(label, `invoice status after the failed charge: ${finalInvoice.status} (attempted=${finalInvoice.attempted}, attempt_count=${finalInvoice.attempt_count})`);

  if (subAfter.status === "past_due" && finalInvoice.status === "open") {
    log(label, `✓ CASE 3: subscription flips to "past_due" (invoice stays "open", retrying) — this is the real signal Track E's renew-check job should watch, and maps cleanly onto our own "payment_failed" status.`);
  } else {
    log(label, `? CASE 3: subscription=${subAfter.status}, invoice=${finalInvoice.status} — doesn't match the now-confirmed shape (past_due / open). Needs a look before Track E's failure-detection design is finalized.`);
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
async function caseFive(priceId: string, expectedUnitAmount: number, currency: string) {
  const label = "case 5";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEnd(priceId, label, "case-5");

  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    amount: expectedUnitAmount,
    currency,
    description: `Track D rehearsal refill (${lookupKey})`,
  });
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
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

  if (prorationLines.length === 0 && finalInvoice.total === expectedUnitAmount) {
    log(label, "✓ CASE 5: refill invoice total matches the plan price exactly, no proration lines.");
  } else if (prorationLines.length === 0) {
    log(label, `? CASE 5: no proration lines, but total (${finalInvoice.total}) doesn't match expected (${expectedUnitAmount}) — worth a look (tax/discount could explain it).`);
  } else {
    log(label, `✗ CASE 5: found ${prorationLines.length} proration line item(s) — not the clean charge Track E assumes.`);
  }
}

// ---------------------------------------------------------------------------
// Case 6a — does the manually-built refill invoice settle on SUBMISSION
// (the PaymentIntent entering "processing") or on SETTLEMENT (it reaching
// "succeeded")? Uses the "successDelayed" test IBAN to force a real ≥3-
// minute gap between the two, so the difference is actually observable —
// an immediate-success IBAN would resolve too fast to tell them apart.
//
// This is the open question from the plan's Track D case 6 writeup and
// directly decides E1/E2's design: if invoices settle on submission, "the
// 15th" is close enough to a real trigger date; if on settlement (as every
// other Stripe doc on delayed-notification methods implies), Track E must
// key strictly off invoice.paid / the webhook, never the calendar date.
// ---------------------------------------------------------------------------
async function caseSixTiming(priceId: string, unitAmount: number, currency: string) {
  const label = "case 6a";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEndSepa(priceId, label, "case-6a", SEPA_TEST_IBANS.successDelayed);

  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    amount: unitAmount,
    currency,
    description: `Track D rehearsal refill (${lookupKey}) — SEPA`,
  });
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
  });
  log(label, `created invoice ${invoice.id} against a SEPA-funded default payment method (successDelayed IBAN), item ${item.id}`);

  // auto_advance's own finalization (draft → open → submitted) is
  // scheduled relative to the customer's TEST CLOCK, not real time — same
  // "~1 hour of clock time" lag noted in case 1 — so it needs the clock
  // pushed forward, exactly like cases 1/2/3/5. Confirmed the hard way:
  // the first real run of this case polled 6 real minutes with the
  // invoice stuck in "draft" because the clock was never advanced. Only
  // AFTER that (once the PaymentIntent is actually submitted, entering
  // "processing") does the SEPA settlement delay run on a real wall-clock
  // timer independent of the test clock — that's what pollInvoiceUntilSettled
  // below is actually measuring.
  const checkpoint = pastNaturalEnd + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);

  const submitted = await stripe.invoices.retrieve(invoice.id!);
  log(label, `at submission: status=${submitted.status}, attempted=${submitted.attempted}`);
  if (submitted.status === "paid") {
    log(label, `✗ CASE 6a: invoice already shows "paid" immediately at submission — that would mean invoice.paid fires on SUBMISSION, not settlement. Surprising; double check the Dashboard for this test clock.`);
    return;
  }

  const settled = await pollInvoiceUntilSettled(invoice.id!, label, 6 * 60 * 1000, 20000);
  if (settled.status === "paid") {
    log(label, `✓ CASE 6a: invoice stayed unpaid through submission and only reached "paid" after a real settlement delay — confirms invoice.paid fires on SETTLEMENT, not submission. E1/E2 must key off the webhook, not the calendar date (as the plan already assumes).`);
  } else {
    log(label, `? CASE 6a: invoice ended at status=${settled.status}, not "paid" — look closer before relying on this timing in Track E.`);
  }
}

// ---------------------------------------------------------------------------
// Case 6b — does a SEPA charge that fails leave the same `past_due` signal
// case 3 confirmed for cards? Uses the "failedDelayed" test IBAN so the
// failure also goes through a real processing window first, matching how
// a real SEPA decline actually arrives.
// ---------------------------------------------------------------------------
async function caseSixFailure(priceId: string, unitAmount: number, currency: string) {
  const label = "case 6b";
  const { clock, customer, sub, pastNaturalEnd } = await pausedPastNaturalEndSepa(priceId, label, "case-6b", SEPA_TEST_IBANS.failedDelayed);

  await stripe.subscriptions.update(sub.id, { pause_collection: null });
  const item = await stripe.invoiceItems.create({
    customer: customer.id,
    subscription: sub.id,
    amount: unitAmount,
    currency,
    description: `Track D rehearsal refill (${lookupKey}) — SEPA`,
  });
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    subscription: sub.id,
    auto_advance: true,
  });
  log(label, `created invoice ${invoice.id} against a SEPA-funded default payment method (failedDelayed IBAN), item ${item.id}`);

  // Same fix as case 6a: finalization needs the test clock advanced, not
  // real time — see the comment there for the full story.
  const checkpoint = pastNaturalEnd + 3 * 60 * 60;
  await advanceClock(clock.id, checkpoint, label);
  const settled = await pollInvoiceUntilSettled(invoice.id!, label, 6 * 60 * 1000, 20000);
  const subAfter = await stripe.subscriptions.retrieve(sub.id);

  log(label, `subscription status after the failed SEPA charge: ${subAfter.status}`);
  log(label, `invoice status after the failed SEPA charge: ${settled.status} (attempted=${settled.attempted}, attempt_count=${settled.attempt_count})`);

  if (subAfter.status === "past_due" && settled.status === "open") {
    log(label, `✓ CASE 6b: SEPA fails the same way card does — subscription flips to "past_due", same signal as case 3. Confirms "SEPA behaves like card" for the failure path.`);
  } else {
    log(label, `? CASE 6b: subscription=${subAfter.status}, invoice=${settled.status} — doesn't match case 3's card-failure shape. Worth a look before assuming SEPA and card failures are interchangeable in Track E.`);
  }
}

async function caseSix(priceId: string, unitAmount: number, currency: string) {
  const label = "case 6";
  if (currency !== "eur") {
    log(label, `⚠ SKIPPED — SEPA Direct Debit only accepts EUR, this plan's price is ${currency}. Re-run against a EUR plan to exercise case 6.`);
    return;
  }
  await caseSixTiming(priceId, unitAmount, currency);
  await caseSixFailure(priceId, unitAmount, currency);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Track D rehearsal — plan: ${lookupKey}\n`);
  const { id: priceId, unitAmount, currency } = await getPriceId();
  if (unitAmount === null) {
    throw new Error(`Price ${priceId} has no unit_amount (tiered/graduated pricing?) — this script assumes a simple per-unit price and can't build a matching invoice item.`);
  }
  log("setup", `resolved lookup_key "${lookupKey}" → price ${priceId} (unit_amount=${unitAmount} ${currency})`);

  const cases: Array<[string, () => Promise<void>]> = [
    ["case 1", () => caseOne(priceId)],
    ["case 2", () => caseTwo(priceId, unitAmount, currency)],
    ["case 3", () => caseThree(priceId, unitAmount, currency)],
    ["case 4", () => caseFour(priceId)],
    ["case 5", () => caseFive(priceId, unitAmount, currency)],
    ["case 6", () => caseSix(priceId, unitAmount, currency)],
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
