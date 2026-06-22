"use client";

import type { Activity } from "@/lib/activities";
import {
  MEMBER_COLORS,
  locationText,
  formatMeta,
  effectiveDate,
  effectiveDayOfWeek,
  type MemberAvailability,
} from "./activities-utils";

interface Props {
  activity: Activity;
  members?: [MemberAvailability, MemberAvailability];
}

const AGE_CATEGORY_ORDER = ["expecting", "newborn", "baby", "toddler", "all ages"];

export default function ActivityCard({ activity, members }: Props) {
  const loc = locationText(activity);
  const description = activity.kind === "event"
    ? (activity.newsletter_description ?? activity.description)
    : activity.description;
  const meta = formatMeta(activity);

  const eventDay = activity.kind === "event" ? effectiveDayOfWeek(activity) : null;
  const freeMembers =
    members && eventDay
      ? members
          .map((m, i) => ({
            initial: m.name[0].toUpperCase(),
            color: MEMBER_COLORS[i],
            free: m.days.length === 0 || m.days.map((d) => d.toLowerCase()).includes(eventDay),
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
      {meta && (
        <p className="text-xs text-coral">{meta}</p>
      )}
      {activity.kind === "location" && loc && (
        <p className="text-xs text-coral">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {loc}
          </a>
        </p>
      )}
      {description && (
        <p className="text-dark text-sm leading-relaxed">
          {description}
        </p>
      )}
      <div className="text-xs text-muted space-y-0.5">
        {activity.organization && <p>By {activity.organization}</p>}
        {activity.kind === "event" && loc && (
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
      </div>
      {activity.age_categories.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {[...activity.age_categories]
            .sort((a, b) => {
              const ai = AGE_CATEGORY_ORDER.indexOf(a);
              const bi = AGE_CATEGORY_ORDER.indexOf(b);
              return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            })
            .map((cat) => (
            <span
              key={cat}
              className="px-2 py-0.5 rounded-full bg-border/50 text-muted text-[11px]"
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </span>
          ))}
        </div>
      )}
      {activity.url && (
        <a
          href={activity.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-md bg-coral text-white text-xs font-medium transition-opacity hover:opacity-80"
        >
          Check it out →
        </a>
      )}
    </div>
  );
}
