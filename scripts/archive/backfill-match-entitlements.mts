/**
 * One-time backfill: seeds a manual_backfill match_entitlements row (and
 * members.matches_remaining) for every currently-paying subscription, per
 * __claude__/billing-simplification-plan.md §4.
 *
 * Forward derivation only — counts round dates remaining between today and
 * each subscription's term_end (see lib/match-ledger.ts#countRoundsRemaining
 * and #deriveTermEnd for the exact math and why trial_end can't be trusted
 * unconditionally). Whatever access someone has today, they keep — this is
 * economically a no-op, not a change anyone can feel.
 *
 * fyp_monthly_single / fyp_monthly_multi are excluded — FYP's own product
 * sharing this Stripe account, out of scope (plan §5).
 *
 * Prints one line per subscription either way. Pass --write to actually
 * commit the manual_backfill rows; without it, nothing is written. Skips
 * anyone who already has ANY match_entitlements row — not just a prior
 * manual_backfill, but also a real term_payment captured by the B3 webhook
 * handler in the meantime (e.g. a subscription that renewed between this
 * migration landing and this script actually being run). Backfilling on
 * top of a live ledger would double-credit them; if the webhook is already
 * tracking someone accurately, they don't need seeding at all. Also safe
 * to re-run after a partial write.
 *
 * Usage:
 *   yarn backfill-match-entitlements              # dry run — prints rows, writes nothing
 *   yarn backfill-match-entitlements --write       # writes manual_backfill rows for real
 *
 * Always runs against .env.production — read the printed rows carefully
 * before passing --write. Compare the total against the plan's §4 table
 * (30 subscriptions, 46 matches owed, as of 2026-08-26) before committing.
 */

import { config } from "dotenv";
import { resolve } from "path";

const write = process.argv.includes("--write");

config({ path: resolve(process.cwd(), ".env.production") });

const { createAdminClient } = await import("../lib/supabase.ts");
const { getStripe } = await import("../lib/stripe.ts");
const { countRoundsRemaining, deriveTermEnd, recordEntitlement, FYP_LOOKUP_KEYS } = await import(
  "../lib/match-ledger.ts"
);

interface Row {
  memberId: string;
  email: string;
  lookupKey: string;
  termEnd: string;
  seed: number;
}

async function main() {
  const supabase = createAdminClient();
  const stripe = getStripe();

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("member_id, stripe_subscription_id, status, members(email)")
    .neq("status", "canceled");

  if (error) throw new Error(`Failed to load subscriptions: ${error.message}`);

  const today = new Date();
  const rows: Row[] = [];

  for (const sub of subs ?? []) {
    // Supabase embeds a many-to-one relation as either an object or a
    // single-element array depending on how the FK is declared — handle both.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membersField = (sub as any).members;
    const email = (Array.isArray(membersField) ? membersField[0]?.email : membersField?.email) ?? "(unknown)";

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const price = stripeSub.items.data[0]?.price;
    const lookupKey = price?.lookup_key ?? "";

    if (FYP_LOOKUP_KEYS.has(lookupKey)) continue;

    const termEnd = deriveTermEnd({
      status: stripeSub.status,
      trial_end: stripeSub.trial_end,
      items: stripeSub.items,
    });

    if (!termEnd) {
      console.warn(`⚠ ${sub.stripe_subscription_id} (${email}) has no usable term end — skipping`);
      continue;
    }

    const seed = countRoundsRemaining(today, termEnd);

    rows.push({
      memberId: sub.member_id,
      email,
      lookupKey,
      termEnd: termEnd.toISOString().slice(0, 10),
      seed,
    });
  }

  const total = rows.reduce((s, r) => s + r.seed, 0);
  console.log(`\n${rows.length} subscriptions, ${total} matches owed:\n`);
  for (const r of rows) {
    console.log(
      `  ${r.email.padEnd(40)} ${r.lookupKey.padEnd(20)} term_end=${r.termEnd}  seed=${r.seed}`
    );
  }

  if (!write) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to commit these as manual_backfill rows.");
    return;
  }

  console.log("\nWriting manual_backfill rows...");
  for (const r of rows) {
    const { data: existing, error: checkError } = await supabase
      .from("match_entitlements")
      .select("id, event")
      .eq("member_id", r.memberId)
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error(`  ✗ ${r.email}: failed to check for existing ledger rows: ${checkError.message}`);
      continue;
    }
    if (existing) {
      console.log(`  – ${r.email}: already has ledger history (${existing.event}), skipping`);
      continue;
    }

    try {
      const applied = await recordEntitlement(supabase, {
        memberId: r.memberId,
        event: "manual_backfill",
        delta: r.seed,
        note: `seeded at cutover: term_end=${r.termEnd}`,
      });
      console.log(applied ? `  ✓ ${r.email}: +${r.seed}` : `  – ${r.email}: rejected as a duplicate`);
    } catch (e) {
      console.error(`  ✗ ${r.email}:`, e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
