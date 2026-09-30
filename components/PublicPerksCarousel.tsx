"use client";

import { useState } from "react";
import Carousel from "@/components/Carousel";
import PerkCard from "@/components/PerkCard";
import type { PublicPerk } from "@/lib/public-perks";

/**
 * Live perks on the public pages (/perks, /partners) as PerkCards — the
 * same card partners preview in "Your Perks" — in the shared Carousel, so
 * the paging (arrows, dots, swipe) matches the /partners example-perk
 * blobs. Display-only: no codes or links reach these pages
 * (lib/public-perks.ts).
 *
 * Below the carousel, "Show all N perks" swaps it for a plain grid of every
 * card, so on mobile (one card per page) people can take in the whole set at once.
 */
export default function PublicPerksCarousel({ perks }: { perks: PublicPerk[] }) {
  const [showAll, setShowAll] = useState(false);

  const renderCard = (perk: PublicPerk) => (
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
  );

  return (
    <div>
      {showAll ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1 pt-1 pb-2">
          {perks.map((perk) => (
            <div key={perk.id} className="flex">
              {renderCard(perk)}
            </div>
          ))}
        </div>
      ) : (
        <Carousel items={perks} getKey={(perk) => perk.id} renderItem={renderCard} />
      )}

      {perks.length > 1 && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-block px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/5 transition"
          >
            {showAll ? "Collapse perks" : `Show all ${perks.length} perks`}
          </button>
        </div>
      )}
    </div>
  );
}
