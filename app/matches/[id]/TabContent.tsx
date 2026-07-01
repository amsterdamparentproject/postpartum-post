"use client";

import type { Activity } from "@/lib/activities";
import { FlatList } from "./ActivityLists";
import { effectiveDate, type MemberAvailability, type SortOrder } from "./activities-utils";

interface Props {
  rec: Activity[];
  sortOrder: SortOrder;
  isActivities: boolean;
  members?: [MemberAvailability, MemberAvailability];
}

export default function TabContent({ rec, sortOrder, isActivities, members }: Props) {
  const sortFn = (a: Activity, b: Activity) => {
    if (sortOrder === "alpha") return a.title.localeCompare(b.title);
    if (sortOrder === "date") {
      const dateCmp = (effectiveDate(a) ?? "").localeCompare(effectiveDate(b) ?? "");
      if (dateCmp !== 0) return dateCmp;
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    }
    return b.score - a.score;
  };

  const sortedRec = [...rec].sort(sortFn);

  if (sortedRec.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FlatList items={sortedRec} members={members} />
    </div>
  );
}
