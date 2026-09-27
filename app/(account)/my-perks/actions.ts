"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { perkLocationLabel } from "@/lib/perk-display";
import { comparePerks } from "@/lib/perk-ranking";
import { revalidatePerksPage } from "@/lib/revalidate-perks";
import type { RedemptionType } from "@/lib/perk-input";

/**
 * The members' "Perks" tab (/my-perks). Launch version, decided 2026-09-26:
 * any signed-in member whose subscription is current can redeem any live
 * perk, once per perk per month. NOT yet enforced (see
 * __claude__/perks-simplification-plan.md): "has a match this month" and
 * the free-trial carve-out.
 *
 * Opening a not-yet-used perk logs 'viewed' (viewPerk); "Use this perk"
 * logs 'redeemed' (redeemPerk).
 *
 * Codes and links only leave the server for perks this member has already
 * redeemed this month (redeemPerk, or listMemberPerks after a redeem).
 * Redeeming inserts a perk_events 'redeemed' row; the unique index on
 * (perk_id, member_id, month) makes a second redeem in the same month a
 * no-op that just shows the same code again.
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
  partner: { business_name: string; image_url: string | null };
  location_label: string | null;
  redemption_type: RedemptionType;
  /** Set once redeemed this month — the code/link to show again. */
  reveal: PerkReveal | null;
};

/** First of the current month in Amsterdam, matching perk_events.month's default. */
function currentMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }).slice(0, 7) + "-01";
}

function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

const LIVE_PERK_FIELDS =
  "id, title, description, expires_at, exclusive, featured, created_at, redemption_type, redemption_code, url, partner_name, partner_url, partner_image_url, location_neighborhood, location_area";

type LivePerkRow = {
  id: string;
  title: string;
  description: string;
  expires_at: string | null;
  exclusive: boolean;
  featured: boolean;
  created_at: string;
  redemption_type: RedemptionType;
  redemption_code: string | null;
  url: string | null;
  partner_name: string;
  partner_url: string | null;
  partner_image_url: string | null;
  location_neighborhood: string | null;
  location_area: string | null;
};

function revealFor(row: LivePerkRow): PerkReveal {
  return {
    redemption_type: row.redemption_type,
    code: row.redemption_type === "code" ? row.redemption_code : null,
    url: row.url || row.partner_url,
  };
}

export async function listMemberPerks(accessToken: string): Promise<MemberPerk[]> {
  const authed = await requireMember(accessToken);
  if (!authed) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("perks_partners")
    .select(LIVE_PERK_FIELDS)
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gte.${today()}`);
  if (error) {
    console.error("[listMemberPerks] query error:", error.message);
    return [];
  }
  const rows = (data ?? []) as LivePerkRow[];
  if (rows.length === 0) return [];

  const { data: redeemed } = await supabase
    .from("perk_events")
    .select("perk_id")
    .eq("member_id", authed.memberId)
    .eq("event_type", "redeemed")
    .eq("month", currentMonth())
    .in("perk_id", rows.map((r) => r.id));
  const redeemedIds = new Set((redeemed ?? []).map((r) => r.perk_id as string));

  return rows
    .map((r) => ({ r, rank: { ...r, status: "published" as const, redeemed_count: 0, viewed_count: 0 } }))
    .sort((a, b) => comparePerks(a.rank, b.rank))
    .map(({ r }) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      expires_at: r.expires_at,
      exclusive: r.exclusive,
      partner: { business_name: r.partner_name, image_url: r.partner_image_url },
      location_label: perkLocationLabel({ neighborhood: r.location_neighborhood, area: r.location_area }),
      redemption_type: r.redemption_type,
      reveal: redeemedIds.has(r.id) ? revealFor(r) : null,
    }));
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
  // 23505 = unique violation: already redeemed this month. Not an error —
  // they already have this month's code, so just show it again.
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
