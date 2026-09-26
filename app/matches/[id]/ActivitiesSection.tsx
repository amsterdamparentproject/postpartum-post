"use client";

import { useMemo, useState } from "react";
import ActivitiesMapClient from "@/components/ActivitiesMapClient";
import type { Activity, Playground } from "@/lib/activities";
import { formatPlaygroundType } from "@/lib/activities";
import CalendarView from "./CalendarView";
import { PerkList, type MatchPerk } from "./PerkList";
import ListRow from "./ListRow";
import TabContent from "./TabContent";
import {
  PLACE_SORTS,
  ACTIVITY_SORTS,
  PLAYGROUND_SORTS,
  effectiveDayOfWeek,
  TOP_N,
  formatDistance,
  type MemberAvailability,
  type Tab,
  type SortOrder,
} from "./activities-utils";

export type { MemberAvailability };

interface Props {
  recommendedPlaces: Activity[];
  recommendedActivities: Activity[];
  all: Activity[];
  center: { lat: number; lng: number } | null;
  memberCoords: { lat: number; lng: number }[];
  members: [MemberAvailability, MemberAvailability];
  matchedOn: string; // YYYY-MM-DD
  playgrounds: Playground[];
  /** Live perks, nearest first: map markers and the List view's Perks tab (the first tab). */
  perks: MatchPerk[];
}

export default function ActivitiesSection({
  recommendedPlaces: allRecommendedPlaces,
  recommendedActivities,
  all,
  center,
  memberCoords,
  members,
  matchedOn,
  playgrounds: allPlaygrounds,
  perks,
}: Props) {
  // Perks lead the List view when there are any.
  const [activeTab, setActiveTab] = useState<Tab>(perks.length > 0 ? "perks" : "activities");
  const [sortOrder, setSortOrder] = useState<SortOrder>("date");

  // Filter Things to Do to events that match at least one member's availability
  const memberDays = useMemo(
    () => new Set(members.flatMap((m) => m.days.map((d) => d.toLowerCase()))),
    [members],
  );
  const activities = useMemo(
    () =>
      all.filter((a) => {
        if (a.kind !== "event") return false;
        const day = effectiveDayOfWeek(a);
        if (!day) return true;
        return memberDays.has(day);
      }),
    [all, memberDays],
  );

  // Top TOP_N of each kind — used everywhere below (map, calendar, lists).
  const filteredRecActivities = useMemo(
    () =>
      recommendedActivities
        .filter((a) => activities.some((b) => b.id === a.id))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_N),
    [recommendedActivities, activities],
  );
  const recommendedPlaces = useMemo(
    () => [...allRecommendedPlaces].sort((a, b) => b.score - a.score).slice(0, TOP_N),
    [allRecommendedPlaces],
  );
  const playgrounds = useMemo(
    () => [...allPlaygrounds].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, TOP_N),
    [allPlaygrounds],
  );

  const calendarEvents = useMemo(
    () => filteredRecActivities.filter((a) => a.kind === "event"),
    [filteredRecActivities],
  );

  const mapPerks = useMemo(
    () =>
      perks.flatMap((p) =>
        p.lat != null && p.lng != null
          ? [{
              id: p.id,
              title: p.title,
              partnerName: p.partner.business_name,
              locationLabel: p.location_label,
              description: p.description,
              imageUrl: p.partner.image_url,
              exclusive: p.exclusive,
              lat: p.lat,
              lng: p.lng,
            }]
          : [],
      ),
    [perks],
  );

  const mapActivities = useMemo(
    () => [...recommendedPlaces, ...filteredRecActivities],
    [recommendedPlaces, filteredRecActivities],
  );

  const sortOptions =
    activeTab === "places" ? PLACE_SORTS :
    activeTab === "playgrounds" ? PLAYGROUND_SORTS :
    ACTIVITY_SORTS;

  // Sorted playgrounds for the tab list
  const sortedPlaygrounds = useMemo(() => {
    const pg = [...playgrounds];
    if (sortOrder === "alpha") pg.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    else pg.sort((a, b) => a.distanceKm - b.distanceKm); // "distance" or fallback
    return pg;
  }, [playgrounds, sortOrder]);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    if (tab === "activities") setSortOrder("date");
    else if (tab === "playgrounds") setSortOrder("distance");
    else setSortOrder("score");
  }

  // No activities or playgrounds: just the perks, if any.
  if (all.length === 0 && playgrounds.length === 0) {
    if (perks.length === 0) return null;
    return (
      <section className="space-y-6">
        <h2 className="text-2xl sm:text-3xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Where to meet up
        </h2>
        <PerkList perks={perks} />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* When to meet up */}
      <div className="space-y-4">
        <h2
          className="text-2xl sm:text-3xl text-dark"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          When to meet up
        </h2>
        <CalendarView events={calendarEvents} members={members} matchedOn={matchedOn} />
      </div>

      <h2
        className="text-2xl sm:text-3xl text-dark pt-6"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Where to meet up
      </h2>

      {/* Map */}
      <ActivitiesMapClient
        activities={mapActivities}
        center={center}
        memberCoords={memberCoords}
        playgrounds={playgrounds}
        perks={mapPerks}
      />

      {/* Map legend — same order as the List view tabs */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        {mapPerks.length > 0 && (
          <span className="flex items-center gap-1.5">
            {/* Mini version of the perk map marker: white sparkle on dark green. */}
            <span
              className="flex items-center justify-center shrink-0 rounded-full"
              style={{ width: 16, height: 16, background: "#8A9E3A" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sparkle.svg" alt="" style={{ width: 10, height: 10, filter: "brightness(0) invert(1)" }} />
            </span>
            Perks
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#AF99FF", flexShrink: 0 }} />
          Events
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#D4E09B", flexShrink: 0 }} />
          Places
        </span>
        {playgrounds.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#D4A373", flexShrink: 0 }} />
            Playgrounds
          </span>
        )}
      </div>
      <p className="text-xs italic text-muted">
        We&apos;ve created recommendations based on your zip codes. Out of respect for your
        privacy, we do not show your locations here.
      </p>

      {/* Activities list */}
      <h3
        className="text-2xl sm:text-3xl text-dark pt-6 mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        List view
      </h3>
      <p className="text-muted text-sm">
        This list has been made for just you two — it&apos;s meant to inspire you! It contains a mix of places to go and events and activities around the city that match your profiles. We&apos;ve also included free playgrounds close by to meet up at, originally sourced (then Post-ified 😉) from <a href="https://www.buitenspeelkaart.nl/amsterdam/" target="_blank" rel="noopener noreferrer" className="text-coral hover:underline">here</a>. 
      </p>
      <p className="text-muted text-xs pb-2">
        Heads up: We&apos;re adding and refining more and more activity data every day. We&apos;d absolutely <a href="https://forms.gle/15dS6YvYucyeU8Cv9" target="_blank" rel="noopener noreferrer" className="text-coral hover:underline">love your feedback</a> on how useful this data is to you and your experience in general!
      </p>

      {/* Tabs */}
      <div className="flex">
        {([
          ...(perks.length > 0 ? ["perks"] : []),
          "activities",
          "places",
          ...(playgrounds.length > 0 ? ["playgrounds"] : []),
        ] as Tab[]).map((tab, i, arr) => {
          const labels: Record<Tab, string> = {
            places: "Places",
            activities: "Events",
            playgrounds: "Playgrounds",
            perks: "Perks",
          };
          const activeStyle =
            tab === "activities"
              ? { background: "#AF99FF", color: "#fff" }
              : tab === "playgrounds"
              ? { background: "#D4A373", color: "#fff" }
              : tab === "perks"
              ? { background: "#8A9E3A", color: "#fff" } // Post Perks wordmark green
              : { background: "#D4E09B", color: "#3a3a3a" };
          return (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-5 py-2 text-sm transition-all cursor-pointer ${
                i === 0 ? "rounded-l-lg" : i === arr.length - 1 ? "rounded-r-lg" : ""
              } ${activeTab === tab ? "" : "bg-border/50 text-muted font-normal"}`}
              style={activeTab === tab ? activeStyle : undefined}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Sort pills (not for perks — they keep their "most popular" order) */}
      {activeTab !== "perks" && (
      <div className="flex flex-wrap gap-2">
        {sortOptions.map(({ label, value }) => {
          const isActive = sortOrder === value;
          const activeStyle =
            activeTab === "activities"
              ? { background: "#AF99FF", borderColor: "#AF99FF", color: "#fff" }
              : activeTab === "playgrounds"
              ? { background: "#D4A373", borderColor: "#D4A373", color: "#fff" }
              : { background: "#D4E09B", borderColor: "#D4E09B", color: "#3a3a3a" };
          return (
            <button
              key={value}
              onClick={() => setSortOrder(value)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                isActive
                  ? ""
                  : "bg-white text-muted border-border hover:border-dark hover:text-dark"
              }`}
              style={isActive ? activeStyle : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
      )}

      {/* Tab content */}
      {activeTab === "perks" ? (
        <PerkList perks={perks} />
      ) : activeTab === "places" ? (
        <TabContent
          rec={recommendedPlaces}
          sortOrder={sortOrder}
        />
      ) : activeTab === "playgrounds" ? (
        <PlaygroundList playgrounds={sortedPlaygrounds} />
      ) : (
        <TabContent
          rec={filteredRecActivities}
          sortOrder={sortOrder}
          members={members}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Playground list
// ---------------------------------------------------------------------------

function PlaygroundList({ playgrounds }: { playgrounds: Playground[] }) {
  if (playgrounds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted">No playgrounds found nearby.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {playgrounds.map((pg) => {
        const distance = formatDistance(pg.distanceKm);
        return (
          <ListRow
            key={pg.id}
            kind="playground"
            title={pg.name ?? "Playground"}
            meta={distance ? `${distance} from your halfway point` : null}
            description={formatPlaygroundType(pg.playground_type)}
            action={{ label: "Open in Maps", href: `https://www.google.com/maps?q=${pg.lat},${pg.lng}`, external: true }}
          />
        );
      })}
    </div>
  );
}
