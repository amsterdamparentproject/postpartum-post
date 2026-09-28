"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Sparkle from "@/components/Sparkle";
import type { PublicPerk } from "@/lib/public-perks";
import { formatDistance } from "./activities-utils";
import ListRow from "./ListRow";

/** A live perk plus its distance from the pair's halfway point (Infinity without coordinates). */
export type MatchPerk = PublicPerk & { distanceKm: number };

// Keeps the tab from turning into a scroll of every live perk in the
// program -- the full set (and everything not relevant to this match) is
// always one tap away via the "See all perks" button into /my-perks.
const PERK_LIST_LIMIT = 8;

/**
 * The List view's "Perks" tab (the first tab): one ListRow per perk, nearest
 * first — partner photo, headline, partner · neighborhood · distance from the
 * pair's halfway point, description, Exclusive/Intro offer badges, and a
 * "Redeem now" button into the member's Perks tab. Caps at
 * PERK_LIST_LIMIT and always ends with a "See all perks" link to
 * /my-perks, the full live list.
 */
/**
 * A "view on the map" link when the perk has at least one geocoded location
 * -- the first one (locations don't carry per-entry distance, so this
 * isn't necessarily the nearest; good enough for "look, it's roughly
 * here" since most perks have one location anyway).
 */
function nearestMapsUrl(locations: MatchPerk["locations"]): string | null {
  const geocoded = locations.find((l) => l.lat != null && l.lng != null);
  return geocoded ? `https://www.google.com/maps?q=${geocoded.lat},${geocoded.lng}` : null;
}

export function PerkList({ perks }: { perks: MatchPerk[] }) {
  const router = useRouter();
  if (perks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted">No perks are live yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {perks.slice(0, PERK_LIST_LIMIT).map((perk) => {
        const distance = formatDistance(perk.distanceKm);
        const meta = [
          perk.partner.business_name,
          perk.location_label,
          distance && `${distance} from your halfway point`,
        ].filter(Boolean).join(" · ");
        return (
          <ListRow
            key={perk.id}
            kind="perk"
            title={perk.title}
            imageUrl={perk.partner.image_url}
            meta={meta || null}
            description={perk.description}
            topBadge={
              (perk.exclusive || perk.frequency === "once") && (
                <span className="inline-flex items-center gap-1.5">
                  {perk.exclusive && (
                    <span
                      className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: "#8A9E3A" }}
                    >
                      <Sparkle className="w-3.5 h-3.5" />
                      Exclusive
                    </span>
                  )}
                  {perk.frequency === "once" && (
                    <span className="pl-2 pr-2 py-0.5 rounded-full text-[11px] font-bold text-white bg-dark">
                      Intro offer
                    </span>
                  )}
                </span>
              )
            }
            action={{ label: "Redeem now", onClick: () => router.push(`/my-perks?perk=${perk.id}`), umamiEvent: "Perks: Open from match page" }}
            mapsUrl={nearestMapsUrl(perk.locations)}
          />
        );
      })}
      <div className="text-center pt-1">
        <Link
          href="/my-perks"
          data-umami-event="Perks: See all perks"
          className="inline-block px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/5 transition"
        >
          See all perks
        </Link>
      </div>
    </div>
  );
}
