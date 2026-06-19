"use client";

import { useMemo, useState } from "react";
import type { Activity } from "@/lib/activities";
import DayModal from "./DayModal";
import {
  DAY_NAMES,
  MEMBER_COLORS,
  effectiveDate,
  toLocalDateStr,
  monthWeekStarts,
  weekDays,
  type MemberAvailability,
} from "./activities-utils";

interface Props {
  events: Activity[];
  members: [MemberAvailability, MemberAvailability];
  matchedOn: string;
}

export default function CalendarView({ events, members, matchedOn }: Props) {
  const allWeeks = useMemo(() => monthWeekStarts(matchedOn), [matchedOn]);
  const monthStr = matchedOn.slice(0, 7);
  const todayStr = toLocalDateStr(new Date());
  const [modalDay, setModalDay] = useState<{ day: Date; events: Activity[] } | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const e of events) {
      const d = effectiveDate(e);
      if (!d) continue;
      const key = d.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const monthLabel = new Date(matchedOn.slice(0, 7) + "-01T00:00:00").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );

  return (
    <div className="space-y-4 bg-white rounded-2xl p-4">
      <p className="text-sm font-semibold text-dark">{monthLabel}</p>

      {/* Member legend */}
      <div className="flex gap-4 text-xs text-muted">
        {members.map((m, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
              style={{ background: MEMBER_COLORS[i] }}
            >
              {m.name[0].toUpperCase()}
            </span>
            {m.name}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="text-[10px] font-bold uppercase tracking-wider text-muted py-1 text-center"
          >
            {d}
          </div>
        ))}

        {allWeeks.flatMap((ws) =>
          weekDays(ws).map((day, i) => {
            const dateStr = toLocalDateStr(day);
            const inMonth = dateStr.startsWith(monthStr);
            const isToday = dateStr === todayStr;
            const dayName = DAY_NAMES[day.getDay()];
            const freeMembers = members
              .map((m, idx) => ({
                initial: m.name[0].toUpperCase(),
                color: MEMBER_COLORS[idx],
                free: m.days.map((d) => d.toLowerCase()).includes(dayName),
              }))
              .filter((m) => m.free);
            const dayEvents = (eventsByDate.get(dateStr) ?? [])
              .slice()
              .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
            const hasEvents = dayEvents.length > 0;

            return (
              <div
                key={`${ws}-${i}`}
                onClick={() =>
                  inMonth && hasEvents && setModalDay({ day, events: dayEvents })
                }
                className={`rounded-lg p-1.5 flex flex-col gap-1 text-left ${
                  !inMonth ? "opacity-20" : isToday ? "bg-border/30" : ""
                } ${inMonth && hasEvents ? "cursor-pointer hover:bg-border/20" : ""}`}
              >
                <span
                  className={`text-xs font-semibold ${isToday ? "text-coral" : "text-dark"}`}
                >
                  {day.getDate()}
                </span>

                {freeMembers.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap">
                    {freeMembers.map((m) => (
                      <span
                        key={m.initial}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold"
                        style={{ background: m.color }}
                        title={`${m.initial} is free`}
                      >
                        {m.initial}
                      </span>
                    ))}
                  </div>
                )}

                {/* Desktop: event count */}
                {hasEvents && (
                  <span className="hidden sm:inline-block text-[10px] font-medium text-purple">
                    {dayEvents.length === 1 ? "1 event" : `${dayEvents.length} events`}
                  </span>
                )}

                {/* Mobile: purple dots */}
                {hasEvents && (
                  <div className="sm:hidden flex gap-0.5 flex-wrap">
                    {dayEvents.map((e) => (
                      <span
                        key={e.id}
                        className="w-1.5 h-1.5 rounded-full bg-purple inline-block"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>

      {modalDay && (
        <DayModal
          day={modalDay.day}
          events={modalDay.events}
          members={members}
          onClose={() => setModalDay(null)}
        />
      )}
    </div>
  );
}
