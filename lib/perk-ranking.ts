/**
 * Ordering for the public perk carousels (/perks, /partners "most popular").
 * Pure — the counts come from perk_events (lib/public-perks.ts).
 *
 * Order: featured, then live before coming soon, then most to least
 * redeemed, then monthly before one-time intro offers, then exclusive, then
 * most to least viewed, then newest. So a heavily redeemed intro offer beats
 * an unredeemed monthly perk, but with equal redemptions monthly leads.
 */

export type RankablePerk = {
  status: "published" | "coming_soon";
  featured: boolean;
  exclusive: boolean;
  frequency: "monthly" | "once";
  created_at: string;
  redeemed_count: number;
  viewed_count: number;
};

export function comparePerks(a: RankablePerk, b: RankablePerk): number {
  return (
    Number(b.featured) - Number(a.featured) ||
    Number(b.status === "published") - Number(a.status === "published") ||
    b.redeemed_count - a.redeemed_count ||
    Number(b.frequency === "monthly") - Number(a.frequency === "monthly") ||
    Number(b.exclusive) - Number(a.exclusive) ||
    b.viewed_count - a.viewed_count ||
    b.created_at.localeCompare(a.created_at)
  );
}

/** Popularity window: counts only look back this far, so old hits don't stay on top forever. */
export const POPULARITY_WINDOW_DAYS = 30;

/** perk_id -> distinct members who redeemed / viewed (one member counts once per perk). */
export function countEventsByPerk(
  events: { perk_id: string; member_id: string; event_type: "viewed" | "redeemed" }[],
): Map<string, { redeemed_count: number; viewed_count: number }> {
  const sets = new Map<string, { redeemed: Set<string>; viewed: Set<string> }>();
  for (const e of events) {
    const entry = sets.get(e.perk_id) ?? { redeemed: new Set<string>(), viewed: new Set<string>() };
    entry[e.event_type].add(e.member_id);
    sets.set(e.perk_id, entry);
  }
  const counts = new Map<string, { redeemed_count: number; viewed_count: number }>();
  for (const [perkId, { redeemed, viewed }] of sets) {
    counts.set(perkId, { redeemed_count: redeemed.size, viewed_count: viewed.size });
  }
  return counts;
}
