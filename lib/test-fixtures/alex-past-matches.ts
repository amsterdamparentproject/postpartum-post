/**
 * Fixed match history for Alex's personal test account
 * (amsterdamparentproject@gmail.com) in the TEST database: exactly two past
 * matches, one and two months back, so /matches always has previous-match
 * cards (and their meetup check-in) to test against.
 *
 * Used by scripts/seed-test-members.mts and the admin "Reset round" test
 * control. Idempotent: clears all of Alex's past-month matches first, then
 * re-creates the two fixtures fresh (so meetup answers reset to 'planning').
 * The current month is never touched — that belongs to the match round.
 *
 * Never call this against production.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const ALEX_TEST_EMAIL = "amsterdamparentproject@gmail.com";

const FIXTURES = [
  { monthsAgo: 1, partnerEmail: "amsterdamparentproject+sofia@gmail.com", topic: "coffee" },
  { monthsAgo: 2, partnerEmail: "amsterdamparentproject+daan@gmail.com", topic: "playdate" },
] as const;

/** First day of the month `monthsAgo` months before today, as YYYY-MM-01. */
function monthStart(monthsAgo: number): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo, 1));
  return utc.toISOString().slice(0, 10);
}

export async function ensureAlexPastMatches(
  // Callers use a client scoped to the postpartumpost schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<string> {
  const emails = [ALEX_TEST_EMAIL, ...FIXTURES.map((f) => f.partnerEmail)];
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, email")
    .in("email", emails);
  if (membersError) throw new Error(`Alex past matches: ${membersError.message}`);

  const idByEmail = new Map((members ?? []).map((m: { id: string; email: string }) => [m.email, m.id]));
  const alexId = idByEmail.get(ALEX_TEST_EMAIL);
  const missing = emails.filter((e) => !idByEmail.has(e));
  if (!alexId || missing.length) {
    return `Skipped Alex's past matches — missing member(s): ${missing.join(", ")}`;
  }

  const { data: topics } = await supabase.from("topics").select("id, name");
  const topicId = new Map((topics ?? []).map((t: { id: string; name: string }) => [t.name, t.id]));

  // Exactly two past matches: clear everything before the current month.
  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .or(`member_id_1.eq.${alexId},member_id_2.eq.${alexId}`)
    .lt("matched_on", monthStart(0));
  if (deleteError) throw new Error(`Alex past matches: ${deleteError.message}`);

  for (const f of FIXTURES) {
    const month = monthStart(f.monthsAgo);

    const { error: matchError } = await supabase.from("matches").insert({
      member_id_1: alexId,
      member_id_2: idByEmail.get(f.partnerEmail),
      matched_on: month,
    });
    if (matchError) throw new Error(`Alex past matches: ${matchError.message}`);

    // Topic on the /matches card comes from Alex's participation that month.
    await supabase.from("monthly_participation").delete().eq("member_id", alexId).eq("month", month);
    if (topicId.has(f.topic)) {
      await supabase
        .from("monthly_participation")
        .insert({ member_id: alexId, month, topic_id: topicId.get(f.topic) });
    }
  }

  return `Alex's past matches reset (${FIXTURES.map((f) => `${monthStart(f.monthsAgo).slice(0, 7)} ${f.topic}`).join(", ")}).`;
}
