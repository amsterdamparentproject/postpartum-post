import { createAdminClient } from "@/lib/supabase";
import type { PerkCardPartner, PerkCardPerk } from "@/components/PerkCard";
import { perkLocationLabel } from "@/lib/perk-display";
import { comparePerks, countEventsByPerk, POPULARITY_WINDOW_DAYS } from "@/lib/perk-ranking";

/**
 * Perks shown on the public pages, not expired: /perks lists 'published'
 * (live) and 'coming_soon' (approved, launching soon); /partners passes
 * liveOnly for its "most popular" section. Ordered by lib/perk-ranking.ts.
 *
 * Deliberately selects NO redemption fields (code, link, redemption type):
 * the page is public, and redeeming is for members only (the future "Use
 * this perk" flow). Only what the card shows leaves the server.
 */
export type PublicPerk = PerkCardPerk & {
  id: string;
  status: "published" | "coming_soon";
  partner: PerkCardPartner;
  location_label: string | null;
};

export async function listPublicPerks({ liveOnly = false }: { liveOnly?: boolean } = {}): Promise<PublicPerk[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }); // YYYY-MM-DD
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("perks_partners")
    .select(
      "id, status, title, description, expires_at, exclusive, featured, created_at, partner_name, partner_image_url, location_neighborhood, location_area",
    )
    .in("status", liveOnly ? ["published"] : ["published", "coming_soon"])
    .or(`expires_at.is.null,expires_at.gte.${today}`);

  if (error) {
    console.error("[listPublicPerks] query error:", error.message);
    return [];
  }
  const perks = data ?? [];
  if (perks.length === 0) return [];

  // Popularity: distinct members who redeemed / viewed each perk in the last
  // POPULARITY_WINDOW_DAYS. Counted here from raw rows — fine at today's
  // volume; move to a counts view if perk_events grows large.
  const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error: eventsError } = await supabase
    .from("perk_events")
    .select("perk_id, member_id, event_type")
    .in("perk_id", perks.map((p) => p.id as string))
    .gte("created_at", since);
  if (eventsError) console.error("[listPublicPerks] events query error:", eventsError.message);
  const counts = countEventsByPerk((events ?? []) as Parameters<typeof countEventsByPerk>[0]);

  const ranked = perks
    .map((p) => ({
      ...p,
      status: p.status as "published" | "coming_soon",
      featured: p.featured as boolean,
      exclusive: p.exclusive as boolean,
      created_at: p.created_at as string,
      ...(counts.get(p.id as string) ?? { redeemed_count: 0, viewed_count: 0 }),
    }))
    .sort(comparePerks);

  return ranked.map((p) => ({
    id: p.id as string,
    status: p.status as PublicPerk["status"],
    title: p.title as string,
    description: p.description as string,
    expires_at: p.expires_at as string | null,
    exclusive: p.exclusive as boolean,
    partner: {
      business_name: p.partner_name as string,
      image_url: p.partner_image_url as string | null,
    },
    location_label: perkLocationLabel({
      neighborhood: p.location_neighborhood as string | null,
      area: p.location_area as string | null,
    }),
  }));
}
