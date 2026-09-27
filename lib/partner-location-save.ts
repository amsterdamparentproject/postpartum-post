import type { createAdminClient } from "@/lib/supabase";
import { geocodeAddress } from "@/lib/geocode";
import type { PartnerLocation, PartnerLocationInput } from "@/app/actions/partners";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Partner location writes, shared by the partner portal (upsertPartnerLocation
 * / deletePartnerLocation in app/actions/partners.ts, partnerId from
 * requirePartner) and /admin/partners (the *Admin versions, partnerId picked
 * by Alex).
 *
 * Geocodes server-side on every save via lib/geocode.ts — the same Nominatim
 * call the activities pipeline uses, with addressdetails=1 for the area /
 * neighborhood suggestion. A failed lookup just leaves coordinates, area and
 * neighborhood null (the location then doesn't show on the match map, and
 * cards show no location).
 */
export async function savePartnerLocationFor(
  supabase: SupabaseClient,
  partnerId: string,
  input: PartnerLocationInput,
): Promise<{ success: boolean; error?: string; location?: PartnerLocation }> {
  const address = input.address.trim();
  if (!address) return { success: false, error: "Address is required" };

  // On update, the location must belong to this partner — never trust a
  // client-supplied id on its own.
  if (input.id) {
    const { data: existing } = await supabase
      .from("partner_locations")
      .select("id")
      .eq("id", input.id)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!existing) return { success: false, error: "Location not found" };
  }

  const geo = await geocodeAddress(address);

  const row = {
    partner_id: partnerId,
    label: input.label.trim() || null,
    address,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    area: geo?.area ?? null,
    neighborhood: geo?.neighborhood ?? null,
  };

  const { data, error } = input.id
    ? await supabase
        .from("partner_locations")
        .update(row)
        .eq("id", input.id)
        .select("id, label, address, area, neighborhood")
        .single()
    : await supabase
        .from("partner_locations")
        .insert(row)
        .select("id, label, address, area, neighborhood")
        .single();

  if (error || !data) {
    console.error("[savePartnerLocation] write error:", error?.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true, location: data as PartnerLocation };
}

export async function deletePartnerLocationFor(
  supabase: SupabaseClient,
  partnerId: string,
  locationId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("partner_locations")
    .delete()
    .eq("id", locationId)
    .eq("partner_id", partnerId); // ownership check baked into the delete itself

  if (error) {
    console.error("[deletePartnerLocation] delete error:", error.message);
    return { success: false, error: "Couldn't delete — try again" };
  }
  return { success: true };
}
