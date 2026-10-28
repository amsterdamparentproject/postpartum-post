import type { createAdminClient } from "@/lib/supabase";
import { generateMatchToken } from "@/lib/match-token";
import {
  DEV_DISTANCES,
  DEV_MATCH_ID,
  DEV_PARTNER_ID,
  DEV_SCENARIOS,
  type DevDistance,
  type DevScenario,
} from "@/lib/dev-tools";

/**
 * Dev-only: turns the given test member and its match partner into one of the
 * DEV_SCENARIOS member types and (re)builds a match with a fixed partner, so
 * each match page variant can be checked without signing out. Callers must
 * have already passed the lock-downs in lib/dev-tools.ts (devToolsEnabledFor).
 *
 * Writes: the viewer's cohort / billing_mode / cohort_only, one partner member
 * (DEV_PARTNER_ID) and one match (DEV_MATCH_ID), all upserted in place.
 */

export type DevMatchResult = { success: true; path: string } | { success: false; error: string };

const AMSTERDAM = { lat: 52.3676, lng: 4.9041 };

export async function buildDevMatch(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  scenario: DevScenario,
  distance: DevDistance,
): Promise<DevMatchResult> {
  if (!(scenario in DEV_SCENARIOS) || !(distance in DEV_DISTANCES)) {
    return { success: false, error: "Unknown option." };
  }

  const { data: viewer, error: viewerError } = await supabase
    .from("members")
    .select("id, lat, lng")
    .ilike("email", email)
    .maybeSingle();
  if (viewerError || !viewer) return { success: false, error: "No member found for this account." };

  const { me, match } = DEV_SCENARIOS[scenario];

  const { error: viewerUpdateError } = await supabase
    .from("members")
    .update({ cohort: me.cohort, billing_mode: me.billing_mode, cohort_only: me.cohort !== null })
    .eq("id", viewer.id);
  if (viewerUpdateError) return { success: false, error: `Couldn't update your member: ${viewerUpdateError.message}` };

  const home = viewer.lat != null && viewer.lng != null ? { lat: viewer.lat, lng: viewer.lng } : AMSTERDAM;
  const partnerCoords =
    distance === "local" ? { lat: home.lat + 0.045, lng: home.lng } // ~5 km north
    : distance === "online" ? { lat: home.lat + 0.3, lng: home.lng } // ~33 km north
    : { lat: null, lng: null };

  const { error: partnerError } = await supabase.from("members").upsert(
    {
      id: DEV_PARTNER_ID,
      first_name: "Sanne",
      last_name: "Devmatch",
      email: "amsterdamparentproject+devmatch-partner@gmail.com",
      status: "active",
      cohort: match.cohort,
      cohort_only: match.cohort !== null,
      billing_mode: match.billing_mode,
      matches_remaining: 0,
      availability: { days: ["wednesday", "saturday"], times: ["morning"] },
      ...partnerCoords,
    },
    { onConflict: "id" },
  );
  if (partnerError) return { success: false, error: `Couldn't set up the partner: ${partnerError.message}` };

  const now = new Date();
  const matchedOn = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { error: matchError } = await supabase.from("matches").upsert(
    {
      id: DEV_MATCH_ID,
      member_id_1: viewer.id,
      member_id_2: DEV_PARTNER_ID,
      matched_on: matchedOn,
      rematch_requested: false,
    },
    { onConflict: "id" },
  );
  if (matchError) return { success: false, error: `Couldn't create the match: ${matchError.message}` };

  return { success: true, path: `/matches/${DEV_MATCH_ID}?token=${generateMatchToken(DEV_MATCH_ID)}` };
}
