/**
 * POST /api/send-match-emails
 *
 * Sends match reveal emails to both members of each committed match pair for
 * the current month. Called by n8n immediately after POST /api/commit-matches.
 *
 * Each pair receives two emails — one to each member — containing their
 * match's name, email, and a link to the shared private match page.
 *
 * The match page URL uses an HMAC-signed token encoding the match ID.
 * Both members receive the same link (one token per match, not per member).
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Request body:
 *   { month?: "YYYY-MM" }   — override for testing / manual runs
 *
 * Response:
 *   { sentCount: number, month: string }
 *
 * Error responses:
 *   401 — bad or missing Bearer token
 *   404 — no committed round found for the month
 *   500 — DB failure or email send error
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { generateMatchToken } from "@/lib/match-token";
import { sendMatchRevealEmail } from "@/lib/emails";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
const TEST_EMAIL = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[send-match-emails] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------------
  let month = currentMonth();
  let testMode = false;
  try {
    const body = await req.json();
    if (body?.month && typeof body.month === "string") month = body.month;
    testMode = body?.testMode === true;
  } catch {
    // Empty body is fine
  }

  const monthDate = monthToDate(month);
  const supabase = createAdminClient();

  // -------------------------------------------------------------------------
  // Load the committed round
  // -------------------------------------------------------------------------
  const { data: round, error: roundError } = await supabase
    .from("match_rounds")
    .select("id, status")
    .eq("month", monthDate)
    .maybeSingle();

  if (roundError) {
    console.error("[send-match-emails] Failed to load match_round:", roundError);
    return NextResponse.json({ error: "Failed to load match round" }, { status: 500 });
  }

  if (!round || !["committed", "locked"].includes(round.status)) {
    return NextResponse.json(
      { error: `No committed round found for ${month}` },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // Load matches for this month with member details
  // -------------------------------------------------------------------------
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(`
      id,
      member_id_1,
      member_id_2,
      member1:member_id_1 ( id, first_name, last_name, email ),
      member2:member_id_2 ( id, first_name, last_name, email )
    `)
    .eq("matched_on", monthDate);

  if (matchesError) {
    console.error("[send-match-emails] Failed to load matches:", matchesError);
    return NextResponse.json({ error: "Failed to load matches" }, { status: 500 });
  }

  if (!matches || matches.length === 0) {
    return NextResponse.json(
      { error: `No matches found for ${month}` },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // Look up topic (coffee / playdate) from monthly_participation.
  // Both members must agree on the topic; if they differ, use null so the
  // email falls back to the generic "hang" copy rather than picking a side.
  // -------------------------------------------------------------------------
  const allMemberIds = [
    ...matches.map((m) => m.member_id_1),
    ...matches.map((m) => m.member_id_2),
  ].filter(Boolean) as string[];

  const { data: participationData } = await supabase
    .from("monthly_participation")
    .select("member_id, topics(name)")
    .in("member_id", allMemberIds)
    .eq("month", monthDate);

  const topicByMemberId = new Map<string, string | null>(
    (participationData ?? []).map((p) => [
      p.member_id,
      (p.topics as unknown as { name: string } | null)?.name ?? null,
    ])
  );

  // -------------------------------------------------------------------------
  // Detect double-matched member (appears in 2 pairs due to odd pool)
  // -------------------------------------------------------------------------
  type MemberRow = { id: string; first_name: string; last_name: string; email: string };

  const matchCountById = new Map<string, number>();
  for (const m of matches) {
    const id1 = ((Array.isArray(m.member1) ? m.member1[0] : m.member1) as MemberRow | null)?.id;
    const id2 = ((Array.isArray(m.member2) ? m.member2[0] : m.member2) as MemberRow | null)?.id;
    if (id1) matchCountById.set(id1, (matchCountById.get(id1) ?? 0) + 1);
    if (id2) matchCountById.set(id2, (matchCountById.get(id2) ?? 0) + 1);
  }

  // -------------------------------------------------------------------------
  // Send emails
  // -------------------------------------------------------------------------
  let sentCount = 0;
  const errors: string[] = [];

  for (const match of matches) {
    const m1 = (Array.isArray(match.member1) ? match.member1[0] : match.member1) as MemberRow | null;
    const m2 = (Array.isArray(match.member2) ? match.member2[0] : match.member2) as MemberRow | null;

    if (!m1 || !m2) {
      errors.push(`Match ${match.id}: missing member data`);
      continue;
    }

    const token = generateMatchToken(match.id);
    const matchPageUrl = `${SITE_URL}/matches/${match.id}?token=${token}`;
    const matchesUrl = `${SITE_URL}/matches`;

    // Generate a magic link to /matches for each recipient so clicking
    // "matches page" in the email signs them straight in without a prompt.
    async function matchesMagicLink(email: string): Promise<string> {
      try {
        const { data, error } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: matchesUrl },
        });
        if (!error && data?.properties?.action_link) {
          return data.properties.action_link;
        }
      } catch (err) {
        console.error("[send-match-emails] generateLink failed for", email, err);
      }
      return matchesUrl;
    }

    try {
      const [m1MatchesLink, m2MatchesLink] = await Promise.all([
        matchesMagicLink(m1.email),
        matchesMagicLink(m2.email),
      ]);

      const isM1Double = (matchCountById.get(m1.id) ?? 0) > 1;
      const isM2Double = (matchCountById.get(m2.id) ?? 0) > 1;

      const t1 = topicByMemberId.get(match.member_id_1) ?? null;
      const t2 = topicByMemberId.get(match.member_id_2) ?? null;
      const topic = t1 && t2 && t1 === t2 ? t1 : null;

      if (!testMode || m1.email === TEST_EMAIL) {
        await sendMatchRevealEmail(
          m1.email,
          m1.first_name,
          m2.first_name,
          m2.last_name,
          topic,
          matchPageUrl,
          m1MatchesLink,
          isM1Double,
        );
        sentCount++;
      }

      if (!testMode || m2.email === TEST_EMAIL) {
        await sendMatchRevealEmail(
          m2.email,
          m2.first_name,
          m1.first_name,
          m1.last_name,
          topic,
          matchPageUrl,
          m2MatchesLink,
          isM2Double,
        );
        sentCount++;
      }
    } catch (err) {
      errors.push(`Match ${match.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error("[send-match-emails] Some emails failed:", errors);
    // Return partial success — don't fail the whole run if one pair errored
    return NextResponse.json(
      { sentCount, month, errors },
      { status: 207 }
    );
  }

  return NextResponse.json({ sentCount, month, testMode });
}
