"use client";

import { useState } from "react";
import type { Activity } from "@/lib/activities";
import { FlatList, WeekGroupedList } from "./ActivityLists";
import { effectiveDate, type MemberAvailability, type SortOrder } from "./activities-utils";

interface Props {
  rec: Activity[];
  rest: Activity[];
  sortOrder: SortOrder;
  isActivities: boolean;
  members?: [MemberAvailability, MemberAvailability];
}

export default function TabContent({ rec, rest, sortOrder, isActivities, members }: Props) {
  const [showAll, setShowAll] = useState(false);

  const sortFn = (a: Activity, b: Activity) => {
    if (sortOrder === "alpha") return a.title.localeCompare(b.title);
    if (sortOrder === "date")
      return (effectiveDate(a) ?? "").localeCompare(effectiveDate(b) ?? "");
    return b.score - a.score;
  };

  const sortedRec = [...rec].sort(sortFn);
  const sortedRest = [...rest].sort(sortFn);
  const useWeeks = isActivities && sortOrder === "date";

  if (sortedRec.length === 0 && sortedRest.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedRec.length > 0 &&
        (useWeeks ? (
          <WeekGroupedList items={sortedRec} members={members} />
        ) : (
          <FlatList items={sortedRec} members={members} />
        ))}
      {sortedRest.length > 0 && (
        <>
          <div className="relative flex items-center py-2">
            <div className="flex-1 border-t border-border" />
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mx-4 shrink-0 text-xs text-muted border border-border bg-white rounded-full px-4 py-1.5 hover:border-coral hover:text-coral transition-colors cursor-pointer"
            >
              {showAll ? "Hide all" : `See all (${sortedRest.length} more)`}
            </button>
            <div className="flex-1 border-t border-border" />
          </div>
          {showAll &&
            (useWeeks ? (
              <WeekGroupedList items={sortedRest} members={members} />
            ) : (
              <FlatList items={sortedRest} members={members} />
            ))}
        </>
      )}
    </div>
  );
}
