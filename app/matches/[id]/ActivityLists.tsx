"use client";

import { useMemo } from "react";
import type { Activity } from "@/lib/activities";
import ActivityCard from "./ActivityCard";
import { groupByWeek, type MemberAvailability } from "./activities-utils";

interface ListProps {
  items: Activity[];
  members?: [MemberAvailability, MemberAvailability];
}

export function FlatList({ items, members }: ListProps) {
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <ActivityCard key={`${a.kind}-${a.id}`} activity={a} members={members} />
      ))}
    </div>
  );
}

export function WeekGroupedList({ items, members }: ListProps) {
  const { groups, undated } = useMemo(() => groupByWeek(items), [items]);
  return (
    <div className="space-y-6">
      {groups.map(({ ws, label, items: its }) => (
        <div key={ws} className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            {label}
          </p>
          {its.map((a) => (
            <ActivityCard key={`${a.kind}-${a.id}`} activity={a} members={members} />
          ))}
        </div>
      ))}
      {undated.length > 0 && (
        <div className="space-y-3">
          {undated.map((a) => (
            <ActivityCard key={`${a.kind}-${a.id}`} activity={a} members={members} />
          ))}
        </div>
      )}
    </div>
  );
}
