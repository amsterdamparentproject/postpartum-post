/**
 * One-time data-hygiene backfill: sets Stripe customer.invoice_settings.
 * default_payment_method for every member with a live subscription whose
 * card is only attached at the subscription level.
 *
 * Confirmed live (2026-09-11, see app/api/renew-check/route.ts's docblock):
 * real, paying members on founding_member/commitment_3mo/standard_monthly
 * have their card on `subscription.default_payment_method`, while
 * `customer.invoice_settings.default_payment_method` is null — a card
 * attached at Stripe Checkout gets bound to the subscription it paid for,
 * not automatically promoted to the customer's own default. renew-check
 * already reads the full fallback chain (subscription ->
 * invoice_settings -> legacy default_source) so it isn't fooled by this,
 * but nothing else in this codebase or in Stripe itself is guaranteed to
 * check subscription-level first — Stripe's own dunning emails, Smart
 * Retries, and the customer billing portal all key off
 * customer.invoice_settings.default_payment_method. This backfill closes
 * that gap in the data itself, once, rather than requiring every future
 * caller to know the fallback chain.
 *
 * Scope: every member with a subscriptions row that isn't 'canceled' —
 * not filtered by member.status, since a paused member's card should be
 * just as correct as an active one's for whenever they resume. Skips
 * anyone whose customer-level field is already set (the common case for
 * any member who has already been through a renew-check cycle or a
 * Stripe-initiated retry that happened to backfill it), and anyone with
 * no resolvable fallback at all (the FYP/comped population — nothing to
 * backfill for them, same payment-method guard as renew-check).
 *
 * Only ever WRITES a genuine PaymentMethod id (pm_...) into
 * invoice_settings.default_payment_method — Stripe's API rejects a
 * legacy Card/Source id (card_.../src_...) there. A member whose only
 * fallback is a legacy default_source is reported separately as needing
 * manual attention rather than silently skipped or force-written.
 *
 * Usage:
 *   npx tsx scripts/backfill-default-payment-method.mts            # dry run — prints what would happen, writes nothing
 *   npx tsx scripts/backfill-default-payment-method.mts --write    # writes the customer updates for real
 *
 * Always runs against .env.production — this is a live-Stripe-account
 * operation. Read the dry-run output before passing --write.
 */

import { config } from "dotenv";
import { resolve } from "path";

const write = process.argv.includes("--write");

config({ path: resolve(process.cwd(), ".env.production") });

const { createAdminClient } = await import("../lib/supabase.ts");
const { getStripe } = await import("../lib/stripe.ts");

type Outcome =
  | "already_correct"
  | "backfilled"
  | "no_fallback"
  | "needs_manual_attention"
  | "no_stripe_subscription"
  | "error";

async function main() {
  const supabase = createAdminClient();
  const stripe = getStripe();

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("member_id, stripe_subscription_id, members(email)")
    .neq("status", "canceled");

  if (error) {
    console.error("Failed to load subscriptions:", error);
    process.exit(1);
  }

  console.log(`${write ? "WRITE" : "DRY RUN"} — checking ${subs?.length ?? 0} live subscriptions\n`);

  const counts: Record<Outcome, number> = {
    already_correct: 0,
    backfilled: 0,
    no_fallback: 0,
    needs_manual_attention: 0,
    no_stripe_subscription: 0,
    error: 0,
  };

  for (const row of subs ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membersField = (row as any).members;
    const email = (Array.isArray(membersField) ? membersField[0]?.email : membersField?.email) ?? "(unknown)";

    if (!row.stripe_subscription_id) {
      counts.no_stripe_subscription++;
      continue;
    }

    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
        expand: ["customer"],
      });
      const customer = sub.customer;
      if (typeof customer === "string" || customer.deleted) {
        console.log(`  ✗ ${email}: customer is a bare id or deleted — skipping`);
        counts.error++;
        continue;
      }

      const customerLevelPM = customer.invoice_settings?.default_payment_method;
      if (customerLevelPM) {
        counts.already_correct++;
        continue;
      }

      // Same fallback order as renew-check: subscription's own default,
      // then the customer's legacy default_source.
      const fallback = sub.default_payment_method ?? customer.default_source;
      if (!fallback) {
        console.log(`  – ${email}: no fallback payment method found (comped/FYP population) — skipping`);
        counts.no_fallback++;
        continue;
      }

      const fallbackId = typeof fallback === "string" ? fallback : fallback.id;
      if (!fallbackId.startsWith("pm_")) {
        console.log(
          `  ! ${email}: only fallback is legacy ${fallbackId} (not a PaymentMethod) — needs manual attention`
        );
        counts.needs_manual_attention++;
        continue;
      }

      if (!write) {
        console.log(`  → ${email}: would set customer default_payment_method to ${fallbackId}`);
        counts.backfilled++;
        continue;
      }

      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: fallbackId },
      });
      console.log(`  ✓ ${email}: customer default_payment_method set to ${fallbackId}`);
      counts.backfilled++;
    } catch (e) {
      console.error(`  ✗ ${email}:`, e instanceof Error ? e.message : e);
      counts.error++;
    }
  }

  console.log("\nSummary:", counts);
  if (!write) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to commit these.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
