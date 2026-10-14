"use client";

import { useEffect, useState } from "react";
import Carousel from "@/components/Carousel";
import PerkCard from "@/components/PerkCard";
import Sparkle from "@/components/Sparkle";
import ListRow from "@/app/matches/[id]/ListRow";
import type { PublicPerk } from "@/lib/public-perks";

/**
 * Live perks on the public pages (/perks, /partners) as PerkCards — the
 * same card partners preview in "Your Perks" — in the shared Carousel, so
 * the paging (arrows, dots, swipe) matches the /partners example-perk
 * blobs. Display-only: no codes or links reach these pages
 * (lib/public-perks.ts).
 *
 * Below the carousel, "Show all N perks" swaps it for a condensed list of
 * every perk (the same ListRow the match page's Perks tab uses), so on mobile
 * (one card per page) people can take in the whole set at once.
 */

/** A "view on the map" link for the perk's first geocoded location, if any. */
function mapsUrl(locations: PublicPerk["locations"]): string | null {
  const geocoded = locations.find((l) => l.lat != null && l.lng != null);
  return geocoded ? `https://www.google.com/maps?q=${geocoded.lat},${geocoded.lng}` : null;
}

export default function PublicPerksCarousel({
  perks,
  showAllToggle = true,
}: {
  perks: PublicPerk[];
  /** The "Show all N perks" list toggle; the homepage turns it off (the carousel is enough there). */
  showAllToggle?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  // Deep link: /perks?perk=<slug or id> opens the carousel on that perk's page
  // and rings its card. Read after mount (not on the server) so /perks stays a
  // cached static page. setState sits in a function the effect calls, the same
  // pattern Carousel uses for the set-state-in-effect rule.
  const [linkedId, setLinkedId] = useState<string | null>(null);
  useEffect(() => {
    const readLink = () => {
      const wanted = new URLSearchParams(window.location.search).get("perk");
      const match = wanted ? perks.find((p) => p.slug === wanted || p.id === wanted) : undefined;
      setLinkedId(match?.id ?? null);
    };
    readLink();
  }, [perks]);
  const linkedIndex = linkedId ? perks.findIndex((p) => p.id === linkedId) : 0;

  const renderCard = (perk: PublicPerk) => (
    <div
      className="flex-1 flex rounded-2xl"
      style={perk.id === linkedId ? { boxShadow: "0 0 0 3px #8A9E3A" } : undefined}
    >
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
    </div>
  );

  return (
    <div>
      {showAll ? (
        <div className="space-y-3 px-1 pt-1 pb-2 text-left">
          {perks.map((perk) => {
            const meta = [perk.partner.business_name, perk.location_label].filter(Boolean).join(" · ");
            const showBadges = perk.status === "coming_soon" || perk.exclusive || perk.frequency === "once";
            return (
              <ListRow
                key={perk.id}
                kind="perk"
                title={perk.title}
                imageUrl={perk.partner.image_url}
                meta={meta || null}
                description={perk.description}
                topBadge={
                  showBadges && (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {perk.status === "coming_soon" && (
                        <span className="px-2 py-0.5 rounded-full border text-[11px] font-medium bg-blue-50 text-blue-700 border-blue-200">
                          Coming soon
                        </span>
                      )}
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
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white bg-dark">
                          Intro offer
                        </span>
                      )}
                    </span>
                  )
                }
                mapsUrl={mapsUrl(perk.locations)}
              />
            );
          })}
        </div>
      ) : (
        <Carousel
          items={perks}
          getKey={(perk) => perk.id}
          renderItem={renderCard}
          initialIndex={Math.max(linkedIndex, 0)}
        />
      )}

      {showAllToggle && perks.length > 1 && (
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
