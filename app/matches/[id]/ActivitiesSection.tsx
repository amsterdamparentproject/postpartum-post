"use client";

import { useMemo, useState } from "react";
import ActivitiesMapClient from "@/components/ActivitiesMapClient";
import type { Activity } from "@/lib/activities";

interface Props {
  recommended: Activity[];
  all: Activity[];
  center: { lat: number; lng: number } | null;
}

type Tab = "recommended" | "all";
type SortOrder = "score" | "alpha";

function locationText(a: Activity): string | null {
  return a.location ?? a.neighborhood ?? a.area ?? null;
}

function formatDate(start_date: string, start_time: string | null | undefined): string {
  const date = new Date(start_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!start_time) return date;
  return `${date} · ${start_time.slice(0, 5)}`;
}

// ---------------------------------------------------------------------------
// Activity card
// ---------------------------------------------------------------------------

function ActivityCard({ activity }: { activity: Activity }) {
  const loc = locationText(activity);
  const isPlace = activity.kind === "location";
  const typeLabel = isPlace ? "Place" : "Activity";
  const typeDot = isPlace ? "bg-coral" : "bg-purple";
  const description = activity.kind === "event"
    ? (activity.tagline ?? activity.description)
    : activity.description;

  return (
    <div
      className={`rounded-xl border p-5 bg-white space-y-1.5 transition-shadow hover:shadow-sm ${
        activity.isRecommended
          ? "border-green ring-1 ring-green/40"
          : "border-border"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-dark text-sm leading-snug">
            {activity.url ? (
              <a
                href={activity.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {activity.title}
              </a>
            ) : (
              activity.title
            )}
          </p>
        </div>
        {activity.isRecommended && (
          <span className="shrink-0 text-xs font-semibold text-dark bg-green rounded-full px-2 py-0.5 flex items-center gap-1">
            ★ Pick
          </span>
        )}
      </div>

      {/* Meta */}
      <p className="text-muted text-xs">
        {activity.kind === "event" && activity.start_date && (
          <>{formatDate(activity.start_date, activity.start_time)} · </>
        )}
        <span className={`inline-block w-2 h-2 rounded-full ${typeDot} mr-1 align-middle`} />
        {typeLabel}
        {loc && <> · {loc}</>}
        {activity.organization && <> · {activity.organization}</>}
      </p>

      {/* Description */}
      {description && (
        <p className="text-dark text-sm leading-relaxed line-clamp-3">{description}</p>
      )}

      {/* Category tags */}
      {activity.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {activity.categories.map((cat) => (
            <span
              key={cat}
              className="text-[10px] font-bold uppercase tracking-widest text-muted bg-border/40 px-1.5 py-0.5 rounded"
            >
              {cat}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ActivitiesSection({ recommended, all, center }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(
    recommended.length > 0 ? "recommended" : "all",
  );
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [sortOrder, setSortOrder] = useState<SortOrder>("score");

  // Derive filter options from all activities
  const categories = useMemo(() => {
    const tags = all.flatMap((a) => a.categories);
    return ["All", ...Array.from(new Set(tags)).sort()];
  }, [all]);

  // Apply filters + sort to the active tab's list
  const visibleActivities = useMemo(() => {
    const base = activeTab === "recommended" ? recommended : all;

    const filtered = base.filter((a) => {
      const matchCat =
        selectedCategory === "All" || a.categories.includes(selectedCategory);
      const matchType =
        selectedType === "All" ||
        (selectedType === "places" && a.kind === "location") ||
        (selectedType === "activities" && a.kind !== "location");
      return matchCat && matchType;
    });

    if (sortOrder === "alpha") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    // Default: score order (already sorted server-side; recommended first in "all")
    return [...filtered].sort((a, b) => {
      if (activeTab === "all") {
        if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
      }
      return b.score - a.score;
    });
  }, [activeTab, recommended, all, selectedCategory, selectedType, sortOrder]);

  // Map shows filtered + sorted set
  const mapActivities = useMemo(() => {
    return all.filter((a) => {
      const matchCat =
        selectedCategory === "All" || a.categories.includes(selectedCategory);
      const matchType =
        selectedType === "All" ||
        (selectedType === "places" && a.kind === "location") ||
        (selectedType === "activities" && a.kind !== "location");
      return matchCat && matchType;
    });
  }, [all, selectedCategory, selectedType]);

  const resetFilters = () => {
    setSelectedCategory("All");
    setSelectedType("All");
    setSortOrder("score");
  };

  const hasFilters =
    selectedCategory !== "All" || selectedType !== "All" || sortOrder !== "score";

  if (recommended.length === 0 && all.length === 0) return null;

  return (
    <section className="space-y-6">
      <h2
        className="text-xl font-semibold text-dark"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Things to do
      </h2>

      {/* Map */}
      <ActivitiesMapClient activities={mapActivities} center={center} />

      {/* Map legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-coral" /> Places to go
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-purple" /> Things to do
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none" style={{ color: "#D4E09B" }}>★</span> Our picks
        </span>
      </div>

      {/* Tabs */}
      <div className="flex">
        <button
          onClick={() => setActiveTab("recommended")}
          className={`px-5 py-2 text-sm rounded-l-lg transition-all cursor-pointer ${
            activeTab === "recommended"
              ? "bg-dark text-white font-semibold"
              : "bg-border/50 text-muted"
          }`}
        >
          Recommended ({recommended.length})
        </button>
        <button
          onClick={() => setActiveTab("all")}
          className={`px-5 py-2 text-sm rounded-r-lg transition-all cursor-pointer ${
            activeTab === "all"
              ? "bg-dark text-white font-semibold"
              : "bg-border/50 text-muted"
          }`}
        >
          Browse all ({all.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Category */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-white text-dark border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-coral"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">
            Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-white text-dark border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-coral"
          >
            <option value="All">All types</option>
            <option value="places">Places to go</option>
            <option value="activities">Things to do</option>
          </select>
        </div>

        {/* Sort */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-muted uppercase tracking-wide">
            Sort
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="bg-white text-dark border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-coral"
          >
            <option value="score">Location</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </div>

        {/* Reset */}
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-sm text-muted hover:text-dark cursor-pointer h-9"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Reset
          </button>
        )}
      </div>

      {/* Activity list */}
      <div className="space-y-3">
        {visibleActivities.length > 0 ? (
          visibleActivities.map((a) => (
            <ActivityCard key={`${a.kind}-${a.id}`} activity={a} />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted">No activities match your filters.</p>
          </div>
        )}
      </div>
    </section>
  );
}
