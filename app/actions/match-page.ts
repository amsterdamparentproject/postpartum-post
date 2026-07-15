"use server";

/**
 * Server-side gate + data loader for the private match reveal page
 * (/matches/[id]). Called from the client after the browser confirms a
 * Supabase session, passing along the session's access token.
 *
 * Authorization does NOT trust anything the client claims about who it is —
 * the access token is independently verified against Supabase Auth here,
 * and the resulting email is checked against the two members on *this*
 * specific match. A signed-in member of a different match gets nothing
 * back, even with a valid link/token.
 *
 * The link token (HMAC of the match ID, see lib/match-token.ts) is kept as
 * a secondary check so a bare guess at a match ID still isn't enough.
 */

import { createAdminClient } from "@/lib/supabase";
import { verifyMatchToken } from "@/lib/match-token";
import { isMember1Initiator } from "@/lib/match-initiator";
import { fetchMatchActivities, type Activity, type Playground } from "@/lib/activities";

export type MatchMemberView = {
  first_name: string;
  last_name: string;
  email: string;
  availability: { days: string[]; times: string[] } | null;
};

export type MatchPageResult =
  | { authorized: false; reason: "invalid" | "not_signed_in" | "forbidden" }
  | { authorized: true; rematchRequested: true }
  | {
      authorized: true;
      rematchRequested: false;
      monthLabel: string;
      matchedOn: string;
      initiatorName: string;
      /** True if the signed-in viewer is member_id_1 (vs member_id_2) on this match. */
      viewerIsM1: boolean;
      /** True if the signed-in viewer is the one designated to reach out first. */
      viewerIsInitiator: boolean;
      /** The signed-in viewer's own member ID — lets the page link straight
       *  into /rematch?member_id=...&match_id=... without an extra session
       *  lookup (see components/RematchSessionGate.tsx for the fallback path). */
      viewerMemberId: string;
      /** Shared topic (coffee/playdate) if both members agree, else null. */
      topic: string | null;
      m1: MatchMemberView;
      m2: MatchMemberView;
      hasActivities: boolean;
      recommendedPlaces: Activity[];
      recommendedActivities: Activity[];
      allActivities: Activity[];
      playgrounds: Playground[];
      center: { lat: number; lng: number } | null;
      memberCoords: { lat: number; lng: number }[];
    };

export async function getMatchPageData(
  matchId: string,
  token: string,
  accessToken: string,
): Promise<MatchPageResult> {
  if (!token || !verifyMatchToken(matchId, token)) {
    return { authorized: false, reason: "invalid" };
  }

  const supabase = createAdminClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  const viewerEmail = userData?.user?.email?.toLowerCase();
  if (userError || !viewerEmail) {
    return { authorized: false, reason: "not_signed_in" };
  }

  const { data: match, error } = await supabase
    .from("matches")
    .select(`
      id,
      member_id_1,
      member_id_2,
      matched_on,
      rematch_requested,
      member1:member_id_1 ( first_name, last_name, email, lat, lng, availability, children ),
      member2:member_id_2 ( first_name, last_name, email, lat, lng, availability, children )
    `)
    .eq("id", matchId)
    .maybeSingle();

  if (error || !match) {
    return { authorized: false, reason: "invalid" };
  }

  type MatchMember = {
    first_name: string;
    last_name: string;
    email: string;
    lat: number | null;
    lng: number | null;
    availability: { days: string[]; times: string[] } | null;
    children: { birth_month: number; birth_year: number; expected: boolean }[] | null;
  };
  const m1 = (Array.isArray(match.member1) ? match.member1[0] : match.member1) as MatchMember | null;
  const m2 = (Array.isArray(match.member2) ? match.member2[0] : match.member2) as MatchMember | null;

  if (!m1 || !m2) {
    return { authorized: false, reason: "invalid" };
  }

  const isViewerM1 = m1.email.toLowerCase() === viewerEmail;
  const isViewerM2 = m2.email.toLowerCase() === viewerEmail;
  if (!isViewerM1 && !isViewerM2) {
    return { authorized: false, reason: "forbidden" };
  }

  if (match.rematch_requested) {
    return { authorized: true, rematchRequested: true };
  }

  const center: { lat: number; lng: number } | null =
    m1.lat != null && m1.lng != null && m2.lat != null && m2.lng != null
      ? { lat: (m1.lat + m2.lat) / 2, lng: (m1.lng + m2.lng) / 2 }
      : m1.lat != null && m1.lng != null ? { lat: m1.lat, lng: m1.lng }
      : m2.lat != null && m2.lng != null ? { lat: m2.lat, lng: m2.lng }
      : null;

  const availabilityDays = Array.from(new Set([
    ...(m1.availability?.days ?? []),
    ...(m2.availability?.days ?? []),
  ]));

  const { recommendedPlaces, recommendedActivities, all: allActivities, playgrounds } =
    await fetchMatchActivities({
      center,
      availabilityDays,
      member1Days: m1.availability?.days ?? [],
      member2Days: m2.availability?.days ?? [],
      member1Children: m1.children ?? [],
      member2Children: m2.children ?? [],
      matchedOn: match.matched_on,
    });

  const matchedOn = new Date(match.matched_on);
  const monthLabel = matchedOn.toLocaleString("en-US", { month: "long", year: "numeric" });
  const m1IsInitiator = isMember1Initiator(match.id);
  const initiatorName = m1IsInitiator ? m1.first_name : m2.first_name;
  const viewerIsInitiator = m1IsInitiator === isViewerM1;
  const hasActivities = recommendedActivities.length > 0 || allActivities.length > 0 || playgrounds.length > 0;

  // Shared topic (coffee/playdate) — only meaningful if both members agreed;
  // falls back to null (generic "hang" copy) if they differ.
  const { data: participationData } = await supabase
    .from("monthly_participation")
    .select("member_id, topics(name)")
    .in("member_id", [match.member_id_1, match.member_id_2])
    .eq("month", match.matched_on);
  const topicByMemberId = new Map<string, string | null>(
    (participationData ?? []).map((p) => [
      p.member_id,
      (p.topics as unknown as { name: string } | null)?.name ?? null,
    ])
  );
  const t1 = topicByMemberId.get(match.member_id_1) ?? null;
  const t2 = topicByMemberId.get(match.member_id_2) ?? null;
  const topic = t1 && t2 && t1 === t2 ? t1 : null;

  const toView = (m: MatchMember): MatchMemberView => ({
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email,
    availability: m.availability,
  });

  return {
    authorized: true,
    rematchRequested: false,
    monthLabel,
    matchedOn: match.matched_on,
    initiatorName,
    viewerIsM1: isViewerM1,
    viewerIsInitiator,
    viewerMemberId: isViewerM1 ? match.member_id_1 : match.member_id_2,
    topic,
    m1: toView(m1),
    m2: toView(m2),
    hasActivities,
    recommendedPlaces,
    recommendedActivities,
    allActivities,
    playgrounds,
    center,
    memberCoords: [
      ...(m1.lat != null && m1.lng != null ? [{ lat: m1.lat, lng: m1.lng }] : []),
      ...(m2.lat != null && m2.lng != null ? [{ lat: m2.lat, lng: m2.lng }] : []),
    ],
  };
}
