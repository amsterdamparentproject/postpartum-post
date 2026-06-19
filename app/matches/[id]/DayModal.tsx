"use client";

import type { Activity } from "@/lib/activities";
import {
  DAY_NAMES,
  MEMBER_COLORS,
  locationText,
  type MemberAvailability,
} from "./activities-utils";

interface Props {
  day: Date;
  events: Activity[];
  members: [MemberAvailability, MemberAvailability];
  onClose: () => void;
}

export default function DayModal({ day, events, members, onClose }: Props) {
  const dayName = DAY_NAMES[day.getDay()];
  const freeMembers = members
    .map((m, i) => ({
      name: m.name,
      color: MEMBER_COLORS[i],
      free: m.days.map((d) => d.toLowerCase()).includes(dayName),
    }))
    .filter((m) => m.free);

  const label = day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-dark">{label}</p>
            {freeMembers.length > 0 && (
              <div className="flex gap-2 mt-1">
                {freeMembers.map((m) => (
                  <span
                    key={m.name}
                    className="flex items-center gap-1 text-xs text-muted"
                  >
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold"
                      style={{ background: m.color }}
                    >
                      {m.name[0].toUpperCase()}
                    </span>
                    {m.name} is free
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-dark text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          {events.map((e) => {
            const loc = locationText(e);
            return (
              <div
                key={e.id}
                className="border border-border rounded-xl p-4 space-y-1"
              >
                <p className="font-semibold text-dark text-sm">
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {e.title}
                    </a>
                  ) : (
                    e.title
                  )}
                </p>
                <p className="text-xs text-muted">
                  {e.start_time && <>{e.start_time.slice(0, 5)} · </>}
                  {loc && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-coral hover:underline"
                    >
                      {loc}
                    </a>
                  )}
                </p>
                {(e.tagline ?? e.description) && (
                  <p className="text-sm text-dark line-clamp-3">
                    {e.tagline ?? e.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
