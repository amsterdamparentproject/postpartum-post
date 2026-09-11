/**
 * One-time remediation for the 2026-09-11 incident: the invoice.payment_succeeded
 * webhook (app/api/webhooks/stripe/route.ts) had an allow-list that only
 * credited billing_reason "subscription_create" / "subscription_cycle"
 * invoices. renew-check (Track E1) bills every renewal via
 * stripe.invoices.create(), which Stripe always stamps billing_reason
 * "manual" — a value the old allow-list silently rejected. Every
 * successful renewal since that filter landed (2026-09-07, commit
 * c650cfc) was charged but never credited a match_entitlements row, and
 * because the handler answered Stripe with 200 either way, Stripe never
 * retried.
 *
 * This script is scoped to exactly the invoices caught by that bug in the
 * 2026-09-11 renew-check run that were already `paid` in Stripe at the time
 * this was written (the ones still `open`/processing as SEPA debits at the
 * time weren't credited yet either, but their invoice.payment_succeeded
 * event hasn't fired — once the webhook fix (this same commit) is live,
 * they'll be credited normally when Stripe eventually marks them paid).
 *
 * For each hardcoded (email, invoiceId) pair below, this:
 *   1. Retrieves the invoice from Stripe and resolves its subscription.
 *   2. Looks up the local subscriptions row and confirms the member's
 *      email matches the expected email (a safety check against a typo in
 *      the hardcoded list below — aborts that one row on mismatch rather
 *      than crediting the wrong member).
 *   3. Re-derives matchesPerTerm, the FYP exclusion, and the gift-discount
 *      check exactly as the webhook handler does, then calls the same
 *      recordEntitlement() used by the webhook — so this produces the
 *      identical match_entitlements row the webhook should have written.
 *   4. recordEntitlement's stripe_invoice_id uniqueness (migration 022)
 *      makes this safe to re-run: an invoice that somehow already has a
 *      term_payment row (e.g. this script run twice, or the webhook fix
 *      already caught it via a Stripe retry) comes back `applied: false`
 *      and is reported as already-credited, not double-credited.
 *
 * Usage:
 *   npx tsx scripts/backfill-missed-renewal-entitlements.mts              # dry run — prints what would happen, writes nothing
 *   npx tsx scripts/backfill-missed-renewal-entitlements.mts --write      # writes the term_payment rows for real
 *
 * Always runs against .env.production — these invoice ids only exist in
 * the live Stripe account. Read the dry-run output before passing --write.
 */

import { config } from "dotenv";
import { resolve } from "path";

const write = process.argv.includes("--write");

config({ path: resolve(process.cwd(), ".env.production") });

const { createAdminClient } = await import("../lib/supabase.ts");
const { getStripe } = await import("../lib/stripe.ts");
const { recordEntitlement, FYP_LOOKUP_KEYS, GIFT_ENTITLEMENT_NOTE } = await import(
  "../lib/match-ledger.ts"
);

// The 8 invoices from the 2026-09-11 renew-check run that Stripe had
// already marked `paid` when this incident was discovered (see the
// conversation this script was written from for the full 18-invoice
// breakdown — the other 10 were still-processing SEPA debits, not paid
// yet, and don't need backfilling).
const TARGETS: { email: string; invoiceId: string }[] = [
  { email: "panianni1@gmail.com", invoiceId: "in_1UEPaLQXyrloqZVhSSxx72hW" },
  { email: "james.perlingiero@gmail.com", invoiceId: "in_1UEPaLQXyrloqZVhLMP5HEai" },
  { email: "ejperez91@gmail.com", invoiceId: "in_1UEPaLQXyrloqZVhUvjN1u67" },
  { email: "selviaroot@gmail.com", invoiceId: "in_1UEPaLQXyrloqZVhYUfdzfyg" },
  { email: "starlingjessica48@gmail.com", invoiceId: "in_1UEPaLQXyrloqZVhYgkbtA3o" },
  { email: "selinaharia@gmail.com", invoiceId: "in_1UEPaKQXyrloqZVhDYgAMJaf" },
  { email: "sophiethompson18@icloud.com", invoiceId: "in_1UEPaKQXyrloqZVhjmuyhhQx" },
  { email: "ematurranoc@gmail.com", invoiceId: "in_1UEPaKQXyrloqZVhKMjp0xvD" },
];

async function isGiftDiscount(stripe: ReturnType<typeof getStripe>, discount: unknown): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const couponRef = (discount as any)?.source?.coupon;
  if (!couponRef) return false;
  const coupon = typeof couponRef === "string" ? await stripe.coupons.retrieve(couponRef) : couponRef;
  return coupon.metadata?.product === "gift_card";
}

async function main() {
  const supabase = createAdminClient();
  const stripe = getStripe();

  console.log(`${write ? "WRITE" : "DRY RUN"} — processing ${TARGETS.length} invoices\n`);

  for (const target of TARGETS) {
    const invoice = await stripe.invoices.retrieve(target.invoiceId);

    if (invoice.status !== "paid") {
      console.log(`  ✗ ${target.email}: invoice ${target.invoiceId} is status="${invoice.status}", not "paid" — skipping`);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptionRef = (invoice as any).parent?.subscription_details?.subscription;
    const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
    if (!subscriptionId) {
      console.log(`  ✗ ${target.email}: invoice ${target.invoiceId} has no subscription — skipping`);
      continue;
    }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("member_id, members(email)")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (subError || !sub) {
      console.log(`  ✗ ${target.email}: no local subscription row for ${subscriptionId} — skipping`);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membersField = (sub as any).members;
    const actualEmail = (Array.isArray(membersField) ? membersField[0]?.email : membersField?.email) ?? "(unknown)";
    if (actualEmail.toLowerCase() !== target.email.toLowerCase()) {
      console.log(
        `  ✗ ${target.email}: SAFETY CHECK FAILED — subscription ${subscriptionId} belongs to "${actualEmail}", not "${target.email}". Skipping this row; fix the hardcoded list.`
      );
      continue;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["discounts.source.coupon"],
    });
    const price = stripeSubscription.items.data[0]?.price;
    const lookupKey = price?.lookup_key ?? "";

    if (FYP_LOOKUP_KEYS.has(lookupKey)) {
      console.log(`  – ${target.email}: FYP product (${lookupKey}), out of scope for the counter — skipping`);
      continue;
    }

    const matchesPerTerm = price?.recurring?.interval_count ?? 1;

    let hasGiftDiscount = false;
    for (const d of stripeSubscription.discounts ?? []) {
      if (typeof d === "string") continue;
      if (await isGiftDiscount(stripe, d)) {
        hasGiftDiscount = true;
        break;
      }
    }

    if (!write) {
      console.log(
        `  → ${target.email}: would credit +${matchesPerTerm} (invoice ${target.invoiceId}, gift=${hasGiftDiscount})`
      );
      continue;
    }

    try {
      const applied = await recordEntitlement(supabase, {
        memberId: sub.member_id,
        event: "term_payment",
        delta: matchesPerTerm,
        stripeInvoiceId: target.invoiceId,
        note: hasGiftDiscount ? GIFT_ENTITLEMENT_NOTE : undefined,
      });
      console.log(
        applied
          ? `  ✓ ${target.email}: +${matchesPerTerm} credited`
          : `  – ${target.email}: rejected as a duplicate (already has a term_payment row for this invoice)`
      );
    } catch (e) {
      console.error(`  ✗ ${target.email}:`, e instanceof Error ? e.message : e);
    }
  }

  if (!write) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to commit these.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
