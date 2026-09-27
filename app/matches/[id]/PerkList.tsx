"use client";

import { useRouter } from "next/navigation";
import Sparkle from "@/components/Sparkle";
import type { PublicPerk } from "@/lib/public-perks";
import { formatDistance } from "./activities-utils";
import ListRow from "./ListRow";

/** A live perk plus its distance from the pair's halfway point (Infinity without coordinates). */
export type MatchPerk = PublicPerk & { distanceKm: number };

/**
 * The List view's "Perks" tab (the first tab): one ListRow per perk, nearest
 * first — partner photo, headline, partner · neighborhood · distance from the
 * pair's halfway point, description, Exclusive (like the playgrounds tab), and a
 * "Redeem now" button into the member's Perks tab.
 */
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
      {perks.map((perk) => {
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
              perk.exclusive && (
                <span
                  className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: "#8A9E3A" }}
                >
                  <Sparkle className="w-3.5 h-3.5" />
                  Exclusive
                </span>
              )
            }
            action={{ label: "Redeem now", onClick: () => router.push(`/my-perks?perk=${perk.id}`) }}
            mapsUrl={perk.lat != null && perk.lng != null ? `https://www.google.com/maps?q=${perk.lat},${perk.lng}` : null}
          />
        );
      })}
    </div>
  );
}
