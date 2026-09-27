"use client";

import Carousel from "@/components/Carousel";
import PerkCard from "@/components/PerkCard";
import type { PublicPerk } from "@/lib/public-perks";

/**
 * Live perks on the public pages (/perks, /partners) as PerkCards — the
 * same card partners preview in "Your Perks" — in the shared Carousel, so
 * the paging (arrows, dots, swipe) matches the /partners example-perk
 * blobs. Display-only: no codes or links reach these pages
 * (lib/public-perks.ts).
 */
export default function PublicPerksCarousel({ perks }: { perks: PublicPerk[] }) {
  return (
    <Carousel
      items={perks}
      getKey={(perk) => perk.id}
      renderItem={(perk) => (
        <PerkCard
          perk={perk}
          partner={perk.partner}
          locationLabel={perk.location_label}
          badge={
            perk.status === "coming_soon" ? (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm bg-blue-50 text-blue-700 border-blue-200">
                Coming soon
              </span>
            ) : undefined
          }
        />
      )}
    />
  );
}
