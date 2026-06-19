"use client";

import { useMemo, useState } from "react";
import ActivitiesMapClient from "@/components/ActivitiesMapClient";
import type { Activity } from "@/lib/activities";
import CalendarView from "./CalendarView";
import TabContent from "./TabContent";
import {
  PLACE_SORTS,
  ACTIVITY_SORTS,
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
}

export default function ActivitiesSection({
  recommendedPlaces,
  recommendedActivities,
  all,
  center,
  memberCoords,
  members,
  matchedOn,
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
        if (!a.day_of_week) return true;
        return memberDays.has(a.day_of_week.toLowerCase());
      }),
    [all, memberDays],
  );

  const recPlaceIds = useMemo(
    () => new Set(recommendedPlaces.map((a) => a.id)),
    [recommendedPlaces],
  );
  const recActivityIds = useMemo(
    () => new Set(recommendedActivities.map((a) => a.id)),
    [recommendedActivities],
  );

  const filteredRecActivities = useMemo(
    () => recommendedActivities.filter((a) => activities.some((b) => b.id === a.id)),
    [recommendedActivities, activities],
  );

  const restPlaces = useMemo(
    () => places.filter((a) => !recPlaceIds.has(a.id)),
    [places, recPlaceIds],
  );
  const restActivities = useMemo(
    () => activities.filter((a) => !recActivityIds.has(a.id)),
    [activities, recActivityIds],
  );

  const calendarEvents = useMemo(
    () => filteredRecActivities.filter((a) => a.kind === "event"),
    [filteredRecActivities],
  );

  const mapActivities = useMemo(
    () => [...recommendedPlaces, ...filteredRecActivities],
    [recommendedPlaces, filteredRecActivities],
  );

  const sortOptions = activeTab === "places" ? PLACE_SORTS : ACTIVITY_SORTS;

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setSortOrder(tab === "activities" ? "date" : "score");
  }

  if (all.length === 0) return null;

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
      />

      {/* Map legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none" style={{ color: "#D4E09B" }}>★</span>{" "}
          Places to go
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none" style={{ color: "#AF99FF" }}>★</span>{" "}
          Things to do
        </span>
      </div>
      <p className="text-xs italic text-muted">
        We&apos;ve created recommendations based on your zip codes. Out of respect for your
        privacy, we do not show your locations here.
      </p>

      {/* When to meet up */}
      <div className="space-y-4">
        <h3
          className="text-2xl sm:text-3xl text-dark"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          When to meet up
        </h3>
        <CalendarView events={calendarEvents} members={members} matchedOn={matchedOn} />
      </div>

      {/* Activities list */}
      <h3
        className="text-2xl sm:text-3xl text-dark"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Activities list
      </h3>

      {/* Tabs */}
      <div className="flex">
        {(["activities", "places"] as Tab[]).map((tab, i) => {
          const labels: Record<Tab, string> = {
            places: `Places to go`,
            activities: `Things to do`,
          };
          const activeStyle =
            tab === "activities"
              ? { background: "#AF99FF", color: "#fff" }
              : { background: "#D4E09B", color: "#3a3a3a" };
          return (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-5 py-2 text-sm transition-all cursor-pointer ${
                i === 0 ? "rounded-l-lg" : "rounded-r-lg"
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
          rest={restPlaces}
          sortOrder={sortOrder}
          isActivities={false}
        />
      ) : (
        <TabContent
          rec={filteredRecActivities}
          rest={restActivities}
          sortOrder={sortOrder}
          isActivities={true}
          members={members}
        />
      )}
    </section>
  );
}
