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
 * With `linkToRedeem`, each live perk's card (and its row in the list view)
 * links to /my-perks?perk=<slug or id>: signed-in members land on the perk's
 * redeem dialog, everyone else on the sign-in form plus the signup pitch
 * (the same path as the DSA page's perk card). Coming-soon perks don't link —
 * there's nothing to redeem yet.
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

/** Where a public perk leads: the members' redeem flow, which also handles signed-out visitors. */
function redeemHref(perk: PublicPerk): string | null {
  return perk.status === "published" ? `/my-perks?perk=${encodeURIComponent(perk.slug ?? perk.id)}` : null;
}

/**
 * Perks per page in grid mode (/perks): three full rows on large screens
 * (3 columns, Tailwind lg = 1024px), three rows of two on medium screens, and
 * the same 6 in the phone list. Server render and first paint use the small
 * size; the effect below switches once the viewport is known.
 */
const PAGE_SIZE_LARGE = 9;
const PAGE_SIZE_SMALL = 6;

export default function PublicPerksCarousel({
  perks,
  showAllToggle = true,
  linkToRedeem = false,
  grid = false,
}: {
  perks: PublicPerk[];
  /** The "Show all N perks" list toggle; the homepage turns it off (the carousel is enough there). */
  showAllToggle?: boolean;
  /** Link live perks to /my-perks?perk=… (redeem if a member, sign in / join if not). Off where cards should stay display-only. */
  linkToRedeem?: boolean;
  /** Show every perk at once instead of the carousel: a card grid (same columns as /my-perks) from sm up, the condensed list on phones. No toggle. */
  grid?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  // Index of the first perk on screen, not a page number, so the position
  // survives the page size changing when the window is resized.
  const [firstIndex, setFirstIndex] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_SMALL);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setPageSize(query.matches ? PAGE_SIZE_LARGE : PAGE_SIZE_SMALL);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
      if (match) setFirstIndex(perks.indexOf(match));
    };
    readLink();
  }, [perks]);
  const linkedIndex = linkedId ? perks.findIndex((p) => p.id === linkedId) : 0;

  const renderCard = (perk: PublicPerk) => {
    const href = linkToRedeem ? redeemHref(perk) : null;
    return (
      <div
        className="flex-1 flex rounded-2xl"
        style={perk.id === linkedId ? { boxShadow: "0 0 0 3px #8A9E3A" } : undefined}
      >
        <PerkCard
          perk={perk}
          partner={perk.partner}
          locationLabel={perk.location_label}
          hideDescription={grid}
          href={href ?? undefined}
          actionLabel={href ? "Redeem now" : undefined}
          umamiEvent={href ? "Perks: Open card from /perks" : undefined}
          badge={
            perk.status === "coming_soon" ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-white text-dark border-border">
                Coming soon
              </span>
            ) : undefined
          }
        />
      </div>
    );
  };

  const pageCount = Math.max(1, Math.ceil(perks.length / pageSize));
  const page = Math.min(Math.floor(firstIndex / pageSize), pageCount - 1);
  const visiblePerks = grid ? perks.slice(page * pageSize, (page + 1) * pageSize) : perks;

  const listView = (
    <div className="space-y-3 px-1 pt-1 pb-2 text-left">
      {visiblePerks.map((perk) => {
        const meta = [perk.partner.business_name, perk.location_label].filter(Boolean).join(" · ");
        const href = linkToRedeem ? redeemHref(perk) : null;
        const showBadges = perk.status === "coming_soon" || perk.exclusive || perk.frequency === "once";
        return (
          <ListRow
            key={perk.id}
            kind="perk"
            title={perk.title}
            imageUrl={perk.partner.image_url}
            meta={meta || null}
            description={grid ? null : perk.description}
            topBadge={
              showBadges && (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {perk.status === "coming_soon" && (
                    <span className="px-2 py-0.5 rounded-full border text-[11px] font-bold bg-white text-dark border-border">
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
            action={
              href ? { label: "Redeem now", href, umamiEvent: "Perks: Open list row from /perks" } : null
            }
            mapsUrl={grid ? null : mapsUrl(perk.locations)}
          />
        );
      })}
    </div>
  );

  if (grid) {
    // Phones get the condensed list (same rows as "Show all"); sm and up get the card grid (same columns as /my-perks).
    return (
      <>
        <div className="sm:hidden">{listView}</div>
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          {visiblePerks.map((perk) => (
            <div key={perk.id} className="flex">
              {renderCard(perk)}
            </div>
          ))}
        </div>
        {pageCount > 1 && (
          <nav aria-label="Perks pages" className="flex items-center justify-center gap-4 mt-6">
            <button
              type="button"
              onClick={() => setFirstIndex((page - 1) * pageSize)}
              disabled={page === 0}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-sm text-muted">
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setFirstIndex((page + 1) * pageSize)}
              disabled={page === pageCount - 1}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <div>
      {showAll ? (
        listView
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
