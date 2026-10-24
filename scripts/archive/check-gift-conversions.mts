/**
 * Read-only check: for the four gift-redemption subscriptions named in
 * __claude__/billing-simplification-plan.md §5, print matches_remaining,
 * subscription status, and the most recent term_payment ledger note, so we
 * can tell whether Track C4's automated "first charge after a gift" notice
 * will actually fire before each one's real-charge date.
 *
 * Always runs against .env.production. Writes nothing — read-only selects.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.production") });

const { createAdminClient } = await import("../lib/supabase.ts");

const TARGETS = [
  { prefix: "sub_1TpCPz", chargeDate: "2026-10-03", amount: "€24" },
  { prefix: "sub_1U1Jgb", chargeDate: "2026-10-05", amount: "€12" },
  { prefix: "sub_1Tych", chargeDate: "2026-11-05", amount: "€24" },
  { prefix: "sub_1TsNe3", chargeDate: "2026-12-05", amount: "€24" },
];

async function main() {
  const supabase = createAdminClient();

  for (const target of TARGETS) {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status, member_id, members(email, matches_remaining)")
      .ilike("stripe_subscription_id", `${target.prefix}%`);

    if (error) {
      console.log(`${target.prefix}...  ERROR: ${error.message}`);
      continue;
    }
    if (!subs || subs.length === 0) {
      console.log(`${target.prefix}...  NOT FOUND locally`);
      continue;
    }

    for (const sub of subs) {
      const member = Array.isArray(sub.members) ? sub.members[0] : sub.members;
      const { data: lastPayment } = await supabase
        .from("match_entitlements")
        .select("event, delta, note, created_at")
        .eq("member_id", sub.member_id)
        .eq("event", "term_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log(
        `${sub.stripe_subscription_id}  sub_status=${sub.status}  email=${member?.email}  matches_remaining=${member?.matches_remaining}  charges=${target.chargeDate} (${target.amount})  last_term_payment_note=${lastPayment?.note ?? "null"}  last_term_payment_at=${lastPayment?.created_at ?? "none"}`
      );
    }
  }
}

main();
