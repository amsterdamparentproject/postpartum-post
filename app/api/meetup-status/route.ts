import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyMeetupToken, type MeetupLinkStatus } from "@/lib/meetup-token";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";

/**
 * GET /api/meetup-status?member={memberId}&match={matchId}&status={met|not_met}&exp={epochMs}&token={hmac}
 *
 * One-click "We met!" / "We didn't meet" links in the meetup reminder email.
 * Validates the HMAC token (rejecting it once past its signed exp — see
 * MEETUP_TOKEN_TTL_MS in lib/meetup-token.ts), records the answer on the
 * member's own side of the match (same columns as the /matches card pills),
 * then signs the member in with a fresh magic link and lands them on
 * feedback for that match.
 *
 * Invalid or expired links redirect home; a rematch-requested match is left
 * untouched and just goes to /matches. Falls back to a plain redirect if
 * magic link generation fails.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const memberId = searchParams.get("member");
  const matchId = searchParams.get("match");
  const status = searchParams.get("status") as MeetupLinkStatus | null;
  const expiresAt = Number(searchParams.get("exp"));
  const token = searchParams.get("token");

  if (
    !memberId ||
    !matchId ||
    !status ||
    !["met", "not_met"].includes(status) ||
    !token ||
    !verifyMeetupToken(memberId, matchId, status, expiresAt, token)
  ) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = createAdminClient();

  const [{ data: member }, { data: match }] = await Promise.all([
    supabase.from("members").select("email").eq("id", memberId).maybeSingle(),
    supabase
      .from("matches")
      .select("member_id_1, member_id_2, rematch_requested")
      .eq("id", matchId)
      .maybeSingle(),
  ]);

  if (!member || !match || (match.member_id_1 !== memberId && match.member_id_2 !== memberId)) {
    return NextResponse.redirect(`${origin}/`);
  }

  let next = "/matches";
  if (!match.rematch_requested) {
    const side = match.member_id_1 === memberId ? 1 : 2;
    const { error } = await supabase
      .from("matches")
      .update({ [`met_up_status_${side}`]: status })
      .eq("id", matchId);
    if (error) {
      console.error("[meetup-status] update error:", error);
    } else {
      // met=1 → the feedback page shows a "great to hear you met up" banner
      next = `/feedback?match=${matchId}${status === "met" ? "&met=1" : ""}`;
    }
  }

  // Sign in via /auth/confirm, then on to `next` — same flow as /api/optin.
  const confirmUrl = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
  const result = await generateMagicLinkWithRetry(supabase, member.email, confirmUrl);
  if (result.success) return NextResponse.redirect(result.url);

  console.error("[meetup-status] Failed to generate magic link:", result.error);
  return NextResponse.redirect(`${origin}${next}`);
}
