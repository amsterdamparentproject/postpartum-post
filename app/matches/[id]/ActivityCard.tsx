"use client";

import type { Activity } from "@/lib/activities";
import {
  MEMBER_COLORS,
  locationText,
  formatDate,
  effectiveDate,
  type MemberAvailability,
} from "./activities-utils";

interface Props {
  activity: Activity;
  members?: [MemberAvailability, MemberAvailability];
}

export default function ActivityCard({ activity, members }: Props) {
  const loc = locationText(activity);
  const newsletterDesc = activity.newsletter_description ?? null;
  const fallbackDesc = activity.description ?? null;
  const date = effectiveDate(activity);

  const freeMembers =
    members && activity.kind === "event" && activity.day_of_week
      ? members
          .map((m, i) => ({
            initial: m.name[0].toUpperCase(),
            color: MEMBER_COLORS[i],
            free: m.days
              .map((d) => d.toLowerCase())
              .includes(activity.day_of_week!.toLowerCase()),
          }))
          .filter((m) => m.free)
      : [];

  return (
    <div
      className={`rounded-xl border p-5 bg-white space-y-2 transition-shadow hover:shadow-sm ${
        activity.isRecommended
          ? activity.kind === "location"
            ? "border-green ring-1 ring-green/40"
            : "border-purple ring-1 ring-purple/40"
          : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-dark text-base leading-snug">
          {activity.title}
        </p>
        {freeMembers.length > 0 && (
          <div className="flex gap-0.5 shrink-0">
            {freeMembers.map((m) => (
              <span
                key={m.initial}
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
                style={{ background: m.color }}
                title={`${m.initial} is free`}
              >
                {m.initial}
              </span>
            ))}
          </div>
        )}
      </div>
      {date && (
        <p className="text-xs text-coral">
          {formatDate(date, activity.start_time)}
        </p>
      )}
      {newsletterDesc ? (
        <p className="text-dark text-sm leading-relaxed">{newsletterDesc}</p>
      ) : fallbackDesc ? (
        <p className="text-dark text-sm leading-relaxed line-clamp-6">{fallbackDesc}</p>
      ) : null}
      <div className="text-xs text-muted space-y-0.5">
        {loc && (
          <p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-coral hover:underline"
            >
              {loc}
            </a>
          </p>
        )}
        {activity.organization && <p>{activity.organization}</p>}
      </div>
      {activity.url && (
        <a
          href={activity.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-purple hover:underline pt-1"
        >
          Learn more →
        </a>
      )}
    </div>
  );
}
