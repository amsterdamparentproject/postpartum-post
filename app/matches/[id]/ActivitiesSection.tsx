"use client";

import { useMemo, useState } from "react";
import ActivitiesMapClient from "@/components/ActivitiesMapClient";
import type { Activity, Playground } from "@/lib/activities";
import { formatPlaygroundType } from "@/lib/activities";
import CalendarView from "./CalendarView";
import TabContent from "./TabContent";
import {
  PLACE_SORTS,
  ACTIVITY_SORTS,
  PLAYGROUND_SORTS,
  effectiveDayOfWeek,
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
}

export default function ActivitiesSection({
  recommendedPlaces,
  recommendedActivities,
  all,
  center,
  memberCoords,
  members,
  matchedOn,
  playgrounds,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("activities");
  const [sortOrder, setSortOrder] = useState<SortOrder>("date");

  const places = useMemo(() => all.filter((a) => a.kind === "location"), [all]);

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

  const filteredRecActivities = useMemo(
    () => recommendedActivities.filter((a) => activities.some((b) => b.id === a.id)),
    [recommendedActivities, activities],
  );

  const calendarEvents = useMemo(
    () => filteredRecActivities.filter((a) => a.kind === "event"),
    [filteredRecActivities],
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

  if (all.length === 0 && playgrounds.length === 0) return null;

  return (
    <section className="space-y-6">
      <h2
        className="text-2xl sm:text-3xl text-dark"
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
      />

      {/* Map legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#D4E09B", flexShrink: 0 }} />
          Places to go
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#AF99FF", flexShrink: 0 }} />
          Things to do
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

      {/* When to meet up */}
      <div className="space-y-4">
        <h3
          className="text-2xl sm:text-3xl text-dark pt-6"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          When to meet up
        </h3>
        <CalendarView events={calendarEvents} members={members} matchedOn={matchedOn} />
      </div>

      {/* Activities list */}
      <h3
        className="text-2xl sm:text-3xl text-dark pt-6 mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Activities list
      </h3>
      <p className="text-muted text-sm">
        This list has been made for just you two — it's meant to inspire you! It contains a mix of places to go and events and activities around the city that match your profiles. We've also included free playgrounds close by to meet up at, originally sourced (then Post-ified 😉) from <a href="https://www.buitenspeelkaart.nl/amsterdam/" target="_blank" rel="noopener noreferrer" className="text-coral hover:underline">here</a>. 
      </p>

      {/* Tabs */}
      <div className="flex">
        {(["activities", "places", ...(playgrounds.length > 0 ? ["playgrounds"] : [])] as Tab[]).map((tab, i, arr) => {
          const labels: Record<Tab, string> = {
            places: "Places to go",
            activities: "Things to do",
            playgrounds: "Playgrounds",
          };
          const activeStyle =
            tab === "activities"
              ? { background: "#AF99FF", color: "#fff" }
              : tab === "playgrounds"
              ? { background: "#D4A373", color: "#fff" }
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

      {/* Sort pills */}
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

      {/* Tab content */}
      {activeTab === "places" ? (
        <TabContent
          rec={recommendedPlaces}
          sortOrder={sortOrder}
          isActivities={false}
        />
      ) : activeTab === "playgrounds" ? (
        <PlaygroundList playgrounds={sortedPlaygrounds} />
      ) : (
        <TabContent
          rec={filteredRecActivities}
          sortOrder={sortOrder}
          isActivities={true}
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
        const distLabel =
          pg.distanceKm < Infinity
            ? (pg.distanceKm < 1
              ? `${Math.round(pg.distanceKm * 1000)}m`
              : `${pg.distanceKm.toFixed(1)}km`) + " from your halfway point."
            : null;
        const mapsUrl = `https://www.google.com/maps?q=${pg.lat},${pg.lng}`;
        const typeLabel = formatPlaygroundType(pg.playground_type);

        return (
          <div
            key={pg.id}
            className="rounded-xl border border-border p-5 bg-white space-y-2 transition-shadow hover:shadow-sm"
          >
            <p className="font-semibold text-dark text-base leading-snug">
              {pg.name ?? "Playground"}
            </p>
            <div className="flex flex-wrap gap-1">
              <span className="px-2 py-0.5 rounded-full bg-border/50 text-muted text-[11px]">
                {typeLabel}
              </span>
            </div>
            {distLabel && (
              <p className="text-dark text-sm leading-relaxed">{distLabel}</p>
            )}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-md bg-coral text-white text-xs font-medium transition-opacity hover:opacity-80"
            >
              Open in Maps →
            </a>
          </div>
        );
      })}
    </div>
  );
}
