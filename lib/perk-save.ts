import type { createAdminClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * DB-side perk check shared by savePartnerPerk (app/actions/partners.ts)
 * and addPerkForPartner / updatePerkAdmin (app/admin/partners/actions.ts).
 * Every caller passes the service-role client it already has.
 */

/**
 * Location is always optional. A location_id, if given, must belong to this
 * partner; none means "not tied to one place" — the partner's locations
 * vary (e.g. pop-up events), or it's their only location anyway. Member
 * cards fall back to the partner's own locations for display.
 */
export async function resolvePerkLocation(
  supabase: SupabaseClient,
  partnerId: string,
  locationId: string | null,
): Promise<{ ok: true; locationId: string | null } | { ok: false; error: string }> {
  if (locationId) {
    const { data: loc } = await supabase
      .from("partner_locations")
      .select("id")
      .eq("id", locationId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!loc) return { ok: false, error: "Location not found" };
  }
  return { ok: true, locationId: locationId || null };
}
