/**
 * The four kinds of things on the match page's Local spots map and List
 * view — perks, events, places, playgrounds — and how each one looks:
 * marker/chip color, chip text color, label, and a square icon (as an HTML
 * string, since the map's Leaflet popups are HTML; the List view renders the
 * same string). Shared by components/ActivitiesMap.tsx (markers + popups)
 * and app/matches/[id]/ListRow.tsx (List view rows) so the two stay one
 * visual system.
 */

export type ListingKind = "perk" | "event" | "place" | "playground";

export const LISTING_COLORS = {
  place: "#D4E09B",      // light green
  event: "#AF99FF",      // purple
  playground: "#D4A373", // tan
  perk: "#8A9E3A",       // darker Post Perks green
} as const;

const svg = (path: string, stroke: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export const LISTING_KINDS: Record<
  ListingKind,
  { label: string; color: string; ink: string; icon: (size: number) => string }
> = {
  perk: {
    label: "Perk",
    color: LISTING_COLORS.perk,
    ink: "#fff",
    icon: (size) =>
      `<img src="/sparkle.svg" alt="" style="width:${size}px;height:${size}px;filter:brightness(0) invert(1)" />`,
  },
  event: {
    label: "Event",
    color: LISTING_COLORS.event,
    ink: "#fff",
    icon: (size) => svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', "#fff", size),
  },
  place: {
    label: "Place",
    color: LISTING_COLORS.place,
    ink: "#3a3a3a",
    icon: (size) =>
      svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>', "#3a3a3a", size),
  },
  playground: {
    label: "Playground",
    color: LISTING_COLORS.playground,
    ink: "#fff",
    // A slide: ladder on the left, chute curving down to the right.
    icon: (size) => svg('<path d="M5 21V5M9 21V5M5 9h4M5 13h4M5 17h4M9 5c5 0 5 8 12 14"/>', "#fff", size),
  },
};
