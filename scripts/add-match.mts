/**
 * Manually inserts a match for two members — for backfilling a match into a
 * round that's already committed/locked (match_drafts edits are blocked
 * once a round is locked; this writes directly to the DB instead of going
 * through the admin UI, which refuses once round.status === "locked").
 *
 * Writes two rows, same as a normal commit would:
 *   - `matches`       — the permanent, committed record (drives "recently
 *                       matched" checks, the member-facing matches page, etc.)
 *   - `match_drafts`  — attached to that month's match_round, scored with
 *                       the real matcher (lib/matcher.ts) so it looks like
 *                       any other draft in the admin UI. Requires a
 *                       match_rounds row for the month to already exist.
 *
 * Optionally sends the real match-reveal email to both members (same
 * template/logic as POST /api/send-match-emails, just for this one pair).
 *
 * Usage:
 *   yarn add-match <member_id_1> <member_id_2> [YYYY-MM] [--notify]              # live
 *   yarn add-match <member_id_1> <member_id_2> [YYYY-MM] [--notify] --dry-run    # safe — .env.local
 *
 * [YYYY-MM] defaults to the current month if omitted. It should normally
 * match the round's month, not necessarily today's — pass it explicitly
 * when backfilling a past round.
 *
 * --notify sends the match-reveal email to both members. Combined with
 * --dry-run, sends are restricted to TEST_EMAIL only (same convention as
 * the app's other testMode flows) so a dry run never emails a real member.
 *
 * Examples:
 *   yarn add-match 3f9e... 7a21...
 *   yarn add-match 3f9e... 7a21... 2026-07
 *   yarn add-match 3f9e... 7a21... 2026-07 --notify
 *   yarn add-match 3f9e... 7a21... 2026-07 --notify --dry-run
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")));
const [id1, id2, monthArg] = rawArgs.filter((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const notify = flags.has("--notify");

if (!id1 || !id2) {
  console.error("Usage: yarn add-match <member_id_1> <member_id_2> [YYYY-MM] [--notify] [--dry-run]");
  process.exit(1);
}

if (id1 === id2) {
  console.error("member_id_1 and member_id_2 must be different members.");
  process.exit(1);
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const id of [id1, id2]) {
  if (!uuidRe.test(id)) {
    console.error(`"${id}" doesn't look like a member UUID.`);
    process.exit(1);
  }
}

const month = monthArg ?? new Date().toISOString().slice(0, 7); // YYYY-MM
if (!/^\d{4}-\d{2}$/.test(month)) {
  console.error(`"${month}" doesn't look like YYYY-MM.`);
  process.exit(1);
}
const matchedOn = `${month}-01`;

// lib/emails/base.ts's subjectPrefix() prepends "TEST: " whenever
// NODE_ENV !== "production" — the same signal every other :prod script in
// this repo sets via `NODE_ENV=production tsx ...`. This script picks
// live/dry-run via a runtime flag instead of separate yarn commands, so it
// has to set NODE_ENV itself; otherwise a live --notify send goes out
// mislabeled "TEST: " (or, run the other way, a dry-run send could go out
// *without* the label). Must happen before importing anything under lib/.
process.env.NODE_ENV = dryRun ? "development" : "production";

const envFile = dryRun ? ".env.local" : ".env.production";
config({ path: resolve(process.cwd(), envFile) });

if (dryRun) {
  console.log(`DRY RUN — using ${envFile} (your local/dev Supabase, nothing live touched)`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

// Imported after dotenv config() so anything these modules read from
// process.env at import time (e.g. RESEND_API_KEY, MATCHER_API_SECRET) sees
// the right values.
const { scorePair, maxAchievableScore, qualityTier } = await import("../lib/matcher.ts");
const { generateMatchToken } = await import("../lib/match-token.ts");
const { isMember1Initiator } = await import("../lib/match-initiator.ts");
const { generateMagicLinkWithRetry } = await import("../lib/supabase/generate-magic-link.ts");
const { sendMatchRevealEmail } = await import("../lib/emails/match-reveal.ts");

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  zipcode: string | null;
  lat: number | null;
  lng: number | null;
  language: string[] | null;
  parent_type: "mom" | "dad" | "anyone" | null;
  availability: { days: string[]; times: string[] } | null;
  match_priority: "age" | "proximity" | null;
  children: { birth_month: number; birth_year: number; expected: boolean }[] | null;
  open_to_second_match: boolean;
};

// --- Validate both members exist, with the full profile the matcher needs ---
const { data: members, error: membersError } = await supabase
  .from("members")
  .select(
    "id, first_name, last_name, email, zipcode, lat, lng, language, parent_type, availability, match_priority, children, open_to_second_match"
  )
  .in("id", [id1, id2]);

if (membersError) {
  console.error("Failed to look up members:", membersError.message);
  process.exit(1);
}

const m1 = (members as MemberRow[] | null)?.find((m) => m.id === id1);
const m2 = (members as MemberRow[] | null)?.find((m) => m.id === id2);
if (!m1 || !m2) {
  const missing = [!m1 && id1, !m2 && id2].filter(Boolean);
  console.error(`Member(s) not found: ${missing.join(", ")}`);
  process.exit(1);
}

// --- Load the round for this month — match_drafts needs a round_id ---
const { data: round, error: roundError } = await supabase
  .from("match_rounds")
  .select("id, status")
  .eq("month", matchedOn)
  .maybeSingle();

if (roundError) {
  console.error("Failed to look up match_rounds:", roundError.message);
  process.exit(1);
}

if (!round) {
  console.error(
    `No match_rounds row found for ${month}. This script attaches a match_drafts row to that round, so it needs to exist first — create it (e.g. run the matcher for that month) before backfilling.`
  );
  process.exit(1);
}

// --- Guard against duplicates in both tables ---
const { data: existingMatch } = await supabase
  .from("matches")
  .select("id")
  .eq("matched_on", matchedOn)
  .or(`and(member_id_1.eq.${id1},member_id_2.eq.${id2}),and(member_id_1.eq.${id2},member_id_2.eq.${id1})`);

if (existingMatch && existingMatch.length > 0) {
  console.error(
    `${m1.first_name} and ${m2.first_name} are already matched for ${month} (match id ${existingMatch[0].id}). Aborting — no duplicate inserted.`
  );
  process.exit(1);
}

const { data: existingDraft } = await supabase
  .from("match_drafts")
  .select("id")
  .eq("round_id", round.id)
  .or(`and(member_id_1.eq.${id1},member_id_2.eq.${id2}),and(member_id_1.eq.${id2},member_id_2.eq.${id1})`);

if (existingDraft && existingDraft.length > 0) {
  console.error(
    `${m1.first_name} and ${m2.first_name} already have a match_drafts row for this round (draft id ${existingDraft[0].id}). Aborting.`
  );
  process.exit(1);
}

// --- Score the pair the same way the real matcher would ---
const { data: participations } = await supabase
  .from("monthly_participation")
  .select("member_id, topic_id, topics(name)")
  .in("member_id", [id1, id2])
  .eq("month", matchedOn);

const topicIdByMember = new Map<string, string | null>();
const topicNameByMember = new Map<string, string | null>();
for (const p of participations ?? []) {
  topicIdByMember.set(p.member_id, p.topic_id ?? null);
  topicNameByMember.set(
    p.member_id,
    (Array.isArray(p.topics) ? p.topics[0] : p.topics)?.name ?? null
  );
}

function toCandidate(m: MemberRow) {
  return {
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email,
    zipcode: m.zipcode,
    lat: m.lat,
    lng: m.lng,
    topic_id: topicIdByMember.get(m.id) ?? null,
    language: m.language,
    parent_type: m.parent_type,
    availability: m.availability,
    match_priority: m.match_priority,
    children: m.children,
    open_to_second_match: m.open_to_second_match ?? false,
  };
}

const candidate1 = toCandidate(m1);
const candidate2 = toCandidate(m2);
const coordMap = new Map<string, { lat: number; lng: number }>();
if (m1.lat && m1.lng) coordMap.set(m1.id, { lat: m1.lat, lng: m1.lng });
if (m2.lat && m2.lng) coordMap.set(m2.id, { lat: m2.lat, lng: m2.lng });

const scored = scorePair(candidate1, candidate2, coordMap);
const score = Math.round(scored.score);
const quality_tier = qualityTier(scored.score, maxAchievableScore(candidate1, candidate2, coordMap));

// --- Insert into matches (the committed record) ---
const { data: inserted, error: insertError } = await supabase
  .from("matches")
  .insert({ member_id_1: id1, member_id_2: id2, matched_on: matchedOn })
  .select("id")
  .single();

if (insertError) {
  console.error("Failed to insert match:", insertError.message);
  process.exit(1);
}
const matchId = inserted.id as string;

console.log(
  `✓ Matched ${m1.first_name} ${m1.last_name} (${m1.email}) with ${m2.first_name} ${m2.last_name} (${m2.email}) for ${month}`
);
console.log(`  match id: ${matchId}`);

// --- Insert into match_drafts (attaches it to the round, scored) ---
const { data: draftInserted, error: draftError } = await supabase
  .from("match_drafts")
  .insert({
    round_id: round.id,
    member_id_1: id1,
    member_id_2: id2,
    score: scored.score,
    breakdown: scored.breakdown,
    quality_tier,
  })
  .select("id")
  .single();

if (draftError) {
  // The matches row is already in — don't roll it back, since it's the
  // record that actually matters. Just surface the failure so it can be
  // added by hand.
  console.error("⚠ Match inserted, but failed to insert match_drafts row:", draftError.message);
} else {
  console.log(`  draft id: ${draftInserted.id} (round ${round.id}, score ${score}, tier ${quality_tier})`);
}

if (round.status !== "locked") {
  console.log(`  note: round for ${month} is currently "${round.status}", not "locked".`);
}

// --- Optionally send the real match-reveal email to both members ---
if (notify) {
  const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
  const TEST_EMAIL = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";
  const matchesUrl = `${SITE_URL}/matches`;
  const matchPageUrl = `${SITE_URL}/matches/${matchId}?token=${generateMatchToken(matchId)}`;

  async function magicLink(email: string, redirectTo: string): Promise<string> {
    const result = await generateMagicLinkWithRetry(supabase, email, redirectTo);
    if (result.success) return result.url;
    console.error("  ⚠ generateMagicLink failed for", email, "—", result.error);
    return redirectTo;
  }

  const t1 = topicNameByMember.get(id1) ?? null;
  const t2 = topicNameByMember.get(id2) ?? null;
  const topic = t1 && t2 && t1 === t2 ? t1 : null;

  // Mirror the odd-pool "double match" badge: true if this member appears
  // in more than one match for the month (including the one just inserted).
  async function isDoubleMatched(memberId: string): Promise<boolean> {
    const { data } = await supabase
      .from("matches")
      .select("id")
      .eq("matched_on", matchedOn)
      .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`);
    return (data?.length ?? 0) > 1;
  }

  const [isM1Double, isM2Double] = await Promise.all([isDoubleMatched(id1), isDoubleMatched(id2)]);
  const m1IsInitiator = isMember1Initiator(matchId);

  // Same testMode convention used elsewhere in this codebase: on a dry run,
  // only actually send if the recipient is the designated test address.
  const testMode = dryRun;

  try {
    const [m1MatchesLink, m2MatchesLink, m1MatchPageUrl, m2MatchPageUrl] = await Promise.all([
      magicLink(m1.email, matchesUrl),
      magicLink(m2.email, matchesUrl),
      magicLink(m1.email, matchPageUrl),
      magicLink(m2.email, matchPageUrl),
    ]);

    let sentCount = 0;

    if (!testMode || m1.email === TEST_EMAIL) {
      await sendMatchRevealEmail(
        m1.email,
        m1.first_name,
        m2.first_name,
        m2.last_name,
        m2.email,
        topic,
        m1MatchPageUrl,
        m1MatchesLink,
        isM1Double,
        m1IsInitiator
      );
      sentCount++;
    }

    if (!testMode || m2.email === TEST_EMAIL) {
      await sendMatchRevealEmail(
        m2.email,
        m2.first_name,
        m1.first_name,
        m1.last_name,
        m1.email,
        topic,
        m2MatchPageUrl,
        m2MatchesLink,
        isM2Double,
        !m1IsInitiator
      );
      sentCount++;
    }

    console.log(`✓ Sent ${sentCount} match-reveal email(s)${testMode ? ` (dry run — restricted to ${TEST_EMAIL})` : ""}`);
  } catch (err) {
    console.error("⚠ Match/draft rows were written, but sending the email failed:", err instanceof Error ? err.message : err);
  }
}
