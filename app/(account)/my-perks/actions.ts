"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { perkLocationLabel } from "@/lib/perk-display";
import { comparePerks } from "@/lib/perk-ranking";
import { revalidatePerksPage } from "@/lib/revalidate-perks";
import { nearestKm } from "@/lib/geo-distance";
import { hasOptedInForMonth } from "@/lib/monthly-opt-in";
import type { PerkFrequency, RedemptionType } from "@/lib/perk-input";

/**
 * The members' "Perks" tab (/my-perks). Launch version, decided 2026-09-26:
 * any signed-in member whose subscription is current AND who opted into
 * something this month -- coffee, playdate, or "no match, just perks"
 * (hasOptedInForMonth, lib/monthly-opt-in.ts) -- can redeem any live perk,
 * once per perk per month. The free-trial carve-out is still not enforced
 * here (see __claude__/perks-simplification-plan.md).
 *
 * Opening a not-yet-used perk logs 'viewed' (viewPerk); "Use this perk"
 * logs 'redeemed' (redeemPerk).
 *
 * Codes and links only leave the server for perks this member has already
 * redeemed this month (redeemPerk, or listMemberPerks after a redeem).
 * Redeeming inserts a perk_events 'redeemed' row; the unique index on
 * (perk_id, member_id, month) makes a second redeem in the same month a
 * no-op that just shows the same code again.
 *
 * `frequency: 'once'` perks (intro offers, e.g. "20% off your first
 * class" -- see db/migrations/028_perk_intro_offers.sql) work the same
 * way from here, except "already redeemed" means ever, not just this
 * month: a DB trigger raises the same 23505 the monthly unique index
 * does, so redeemPerk's error handling needs no changes, and
 * listMemberPerks checks redemption history across all months (not just
 * the current one) for these perks.
 */

const CAN_REDEEM_STATUSES = ["active", "paused", "canceling"];

export type PerkReveal = {
  redemption_type: RedemptionType;
  code: string | null;
  url: string | null; // perk link, else the partner's website
};

export type MemberPerk = {
  id: string;
  title: string;
  description: string;
  expires_at: string | null;
  exclusive: boolean;
  frequency: PerkFrequency;
  estimated_savings: number | null;
  partner: { business_name: string; image_url: string | null };
  location_label: string | null;
  redemption_type: RedemptionType;
  /** Set once redeemed -- permanently for a 'once' (intro offer) perk, for the current month otherwise. */
  reveal: PerkReveal | null;
  /** Straight-line distance from the member's own zipcode, for the "Nearest" filter. Infinity when either coordinate is missing. */
  distanceKm: number;
};

/** First of the current month in Amsterdam, matching perk_events.month's default. */
function currentMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }).slice(0, 7) + "-01";
}

function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

const LIVE_PERK_FIELDS =
  "id, title, description, expires_at, exclusive, frequency, estimated_savings, featured, created_at, redemption_type, redemption_code, url, partner_name, partner_url, partner_image_url, is_online, locations";

/** One of the perk's locations, straight from the perks_partners view's jsonb (db/migrations/031_perk_multi_location.sql). */
type LiveLocationRow = { neighborhood: string | null; area: string | null; latitude: number | null; longitude: number | null };

type LivePerkRow = {
  id: string;
  title: string;
  description: string;
  expires_at: string | null;
  exclusive: boolean;
  frequency: PerkFrequency;
  estimated_savings: number | null;
  featured: boolean;
  created_at: string;
  redemption_type: RedemptionType;
  redemption_code: string | null;
  url: string | null;
  partner_name: string;
  partner_url: string | null;
  partner_image_url: string | null;
  is_online: boolean;
  locations: LiveLocationRow[] | null;
};

function revealFor(row: LivePerkRow): PerkReveal {
  return {
    redemption_type: row.redemption_type,
    code: row.redemption_type === "code" ? row.redemption_code : null,
    url: row.url || row.partner_url,
  };
}

export type MemberPerksResult = {
  /** False when the member has not opted into anything this month -- coffee,
   *  playdate, or perks-only (see lib/monthly-opt-in.ts). `perks` is always
   *  empty in that case; the page shows the opt-in prompt instead of the grid. */
  optedIn: boolean;
  perks: MemberPerk[];
};

export async function listMemberPerks(accessToken: string): Promise<MemberPerksResult> {
  const authed = await requireMember(accessToken);
  if (!authed) return { optedIn: false, perks: [] };

  const supabase = createAdminClient();
  const optedIn = await hasOptedInForMonth(supabase, authed.memberId, currentMonth());
  if (!optedIn) return { optedIn: false, perks: [] };
  const { data, error } = await supabase
    .from("perks_partners")
    .select(LIVE_PERK_FIELDS)
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gte.${today()}`);
  if (error) {
    console.error("[listMemberPerks] query error:", error.message);
    return { optedIn: true, perks: [] };
  }
  const rows = (data ?? []) as LivePerkRow[];
  if (rows.length === 0) return { optedIn: true, perks: [] };

  // For the "Nearest" filter -- distance from the member's own zipcode
  // (members.lat/lng, geocoded at signup), not a match's halfway point
  // like the match page's perk list uses. Missing either coordinate
  // (member or perk) falls back to Infinity, same convention as
  // MatchPerk on the match page.
  const { data: memberRow } = await supabase
    .from("members")
    .select("lat, lng")
    .eq("id", authed.memberId)
    .maybeSingle();
  const memberCoords =
    memberRow?.lat != null && memberRow?.lng != null
      ? { lat: memberRow.lat as number, lng: memberRow.lng as number }
      : null;
  function distanceFor(r: LivePerkRow): number {
    if (!memberCoords) return Infinity;
    const geocoded = (r.locations ?? []).filter(
      (l): l is LiveLocationRow & { latitude: number; longitude: number } => l.latitude != null && l.longitude != null,
    );
    return nearestKm(memberCoords, geocoded.map((l) => ({ lat: l.latitude, lng: l.longitude })));
  }

  // Fetched across all months, not just the current one: a 'once' perk's
  // redemption can date from any earlier month and still counts as used.
  const { data: redeemed } = await supabase
    .from("perk_events")
    .select("perk_id, month")
    .eq("member_id", authed.memberId)
    .eq("event_type", "redeemed")
    .in("perk_id", rows.map((r) => r.id));
  const redeemedMonthsByPerk = new Map<string, Set<string>>();
  for (const row of redeemed ?? []) {
    const perkId = row.perk_id as string;
    const months = redeemedMonthsByPerk.get(perkId) ?? new Set<string>();
    months.add(row.month as string);
    redeemedMonthsByPerk.set(perkId, months);
  }
  function isRedeemed(r: LivePerkRow): boolean {
    const months = redeemedMonthsByPerk.get(r.id);
    if (!months) return false;
    return r.frequency === "once" ? true : months.has(currentMonth());
  }

  const perks = rows
    .map((r) => ({ r, rank: { ...r, status: "published" as const, redeemed_count: 0, viewed_count: 0 } }))
    .sort((a, b) => comparePerks(a.rank, b.rank))
    .map(({ r }) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      expires_at: r.expires_at,
      exclusive: r.exclusive,
      frequency: r.frequency,
      estimated_savings: r.estimated_savings,
      partner: { business_name: r.partner_name, image_url: r.partner_image_url },
      location_label: perkLocationLabel((r.locations ?? []).map((l) => ({ neighborhood: l.neighborhood, area: l.area })), r.is_online),
      redemption_type: r.redemption_type,
      reveal: isRedeemed(r) ? revealFor(r) : null,
      distanceKm: distanceFor(r),
    }));

  return { optedIn: true, perks };
}

export async function redeemPerk(
  accessToken: string,
  perkId: string,
): Promise<{ success: true; reveal: PerkReveal } | { success: false; error: string }> {
  const authed = await requireMember(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };

  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("members")
    .select("status")
    .eq("id", authed.memberId)
    .maybeSingle();
  if (!member || !CAN_REDEEM_STATUSES.includes(member.status as string)) {
    return { success: false, error: "Perks are for members with an active subscription" };
  }

  const optedIn = await hasOptedInForMonth(supabase, authed.memberId, currentMonth());
  if (!optedIn) {
    return { success: false, error: "You haven't opted into Postpartum Post this month" };
  }

  const { data: perk } = await supabase
    .from("perks_partners")
    .select(LIVE_PERK_FIELDS)
    .eq("id", perkId)
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gte.${today()}`)
    .maybeSingle();
  if (!perk) return { success: false, error: "This perk isn't available anymore" };

  // month is filled in by the database (Amsterdam time) — never sent from here.
  const { error } = await supabase
    .from("perk_events")
    .insert({ perk_id: perkId, member_id: authed.memberId, event_type: "redeemed" });
  // 23505 = unique violation (the monthly index) or the 028 trigger's
  // equivalent check for a 'once' perk. Not an error either way — they
  // already have the code for this redemption, so just show it again.
  if (error && error.code !== "23505") {
    console.error("[redeemPerk] insert error:", error.message);
    return { success: false, error: "Couldn't redeem — try again" };
  }

  if (!error) revalidatePerksPage(); // redemptions feed the "most popular" order

  return { success: true, reveal: revealFor(perk as LivePerkRow) };
}

/**
 * Logs a 'viewed' event when a member opens a perk they haven't used yet
 * (the dialog is the perk page). Fire-and-forget from the client: it never
 * blocks the dialog, and failures are only logged. Repeat opens add rows,
 * but every count uses distinct members (lib/perk-ranking.ts). Doesn't
 * refresh /perks or /partners — views are too frequent for that; their
 * 5-minute revalidate picks them up.
 */
export async function viewPerk(accessToken: string, perkId: string): Promise<void> {
  const authed = await requireMember(accessToken);
  if (!authed) return;

  const supabase = createAdminClient();
  const { data: perk } = await supabase
    .from("perks")
    .select("id")
    .eq("id", perkId)
    .eq("status", "published")
    .maybeSingle();
  if (!perk) return;

  const { error } = await supabase
    .from("perk_events")
    .insert({ perk_id: perkId, member_id: authed.memberId, event_type: "viewed" });
  if (error) console.error("[viewPerk] insert error:", error.message);
}
