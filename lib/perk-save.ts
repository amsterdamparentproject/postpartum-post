import type { createAdminClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * DB-side perk checks shared by savePartnerPerk (app/actions/partners.ts)
 * and addPerkForPartner / updatePerkAdmin (app/admin/partners/actions.ts).
 * Every caller passes the service-role client it already has.
 */

/**
 * Locations are always optional and, since db/migrations/031_perk_multi_location.sql,
 * many-to-many: a perk can be tied to any number of a partner's own
 * locations (every id given must belong to this partner), none ("not tied
 * to one place" -- the partner's locations vary, e.g. pop-up events, or it
 * doesn't have one anyway), or several (the same perk offered at more than
 * one studio). Independent of is_online -- a perk can be online AND have
 * locations.
 */
export async function resolvePerkLocations(
  supabase: SupabaseClient,
  partnerId: string,
  locationIds: string[],
): Promise<{ ok: true; locationIds: string[] } | { ok: false; error: string }> {
  const ids = [...new Set(locationIds)];
  if (ids.length === 0) return { ok: true, locationIds: [] };

  const { data: owned } = await supabase
    .from("partner_locations")
    .select("id")
    .eq("partner_id", partnerId)
    .in("id", ids);

  if (!owned || owned.length !== ids.length) {
    return { ok: false, error: "Location not found" };
  }
  return { ok: true, locationIds: ids };
}

/**
 * Syncs perk_locations to exactly `locationIds` for one perk -- delete
 * everything currently there, then insert the new set. Called after the
 * perk row itself is written (insert or update), once resolvePerkLocations
 * has validated ownership. A no-op delete-then-insert-nothing for a perk
 * with no locations.
 */
export async function savePerkLocations(
  supabase: SupabaseClient,
  perkId: string,
  locationIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: deleteError } = await supabase
    .from("perk_locations")
    .delete()
    .eq("perk_id", perkId);
  if (deleteError) {
    console.error("[savePerkLocations] delete error:", deleteError.message);
    return { ok: false, error: "Couldn't save — try again" };
  }

  if (locationIds.length === 0) return { ok: true };

  const { error: insertError } = await supabase
    .from("perk_locations")
    .insert(locationIds.map((location_id) => ({ perk_id: perkId, location_id })));
  if (insertError) {
    console.error("[savePerkLocations] insert error:", insertError.message);
    return { ok: false, error: "Couldn't save — try again" };
  }
  return { ok: true };
}
