"use client";

import { useMemo } from "react";
import MatchCards from "@/app/matches/[id]/MatchCards";
import ActivitiesSection from "@/app/matches/[id]/ActivitiesSection";
import type { MatchPerk } from "@/app/matches/[id]/PerkList";
import { nearestKm } from "@/lib/geo-distance";
import { PREVIEW_CENTER, PREVIEW_MEMBERS, buildPreviewMatch } from "@/lib/match-preview-fixture";
import type { PublicPerk } from "@/lib/public-perks";

/**
 * The scrolling body of the homepage's sample match page overlay: the real
 * match page's own components (match cards, ActivitiesSection with its
 * calendar, map and List view) fed fictional data. Split out of
 * MatchPreview so the homepage can load it only when the overlay opens
 * (next/dynamic there), keeping Leaflet-adjacent code and the calendar/list
 * out of the homepage's initial JavaScript.
 *
 * The map, calendar and tabs are live to play with, but `preview` strips
 * every link into the member area. The Perks tab and map pins use the live
 * public perks (same data as /perks), with distance from the made-up
 * halfway point. Mounted client-side only, after the overlay opens, so the
 * dates in the fixture can't mismatch a server render.
 */
export default function MatchPreviewBody({ perks }: { perks: PublicPerk[] }) {
  const match = useMemo(() => buildPreviewMatch(), []);
  const nearbyPerks: MatchPerk[] = useMemo(
    () =>
      perks.map((p) => ({
        ...p,
        distanceKm: nearestKm(
          PREVIEW_CENTER,
          p.locations.filter((l): l is typeof l & { lat: number; lng: number } => l.lat != null && l.lng != null),
        ),
      })),
    [perks],
  );

  return (
    <div className="space-y-8">
      <p className="mx-auto w-fit text-xs text-center rounded-full bg-coral/10 text-coral px-3 py-1">
        Sample match page
      </p>

      <div className="text-center space-y-2">
        <h2 className="text-4xl font-semibold text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          {PREVIEW_MEMBERS[0].first_name} <span className="text-coral">&</span> {PREVIEW_MEMBERS[1].first_name}
        </h2>
        <p className="text-muted leading-relaxed text-sm max-w-md mx-auto">
          Each month you get contact details, a shared availability calendar, and places picked for your two
          profiles, shared just between the two of you.
        </p>
      </div>

      <MatchCards members={PREVIEW_MEMBERS} preview />

      <ActivitiesSection
        recommendedPlaces={match.recommendedPlaces}
        recommendedActivities={match.recommendedActivities}
        all={match.allActivities}
        center={PREVIEW_CENTER}
        memberCoords={[]}
        members={[
          { name: PREVIEW_MEMBERS[0].first_name, days: PREVIEW_MEMBERS[0].availability?.days ?? [] },
          { name: PREVIEW_MEMBERS[1].first_name, days: PREVIEW_MEMBERS[1].availability?.days ?? [] },
        ]}
        matchedOn={match.matchedOn}
        playgrounds={match.playgrounds}
        perks={nearbyPerks}
        preview
      />
    </div>
  );
}
