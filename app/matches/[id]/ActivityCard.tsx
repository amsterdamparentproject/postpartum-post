"use client";

import type { Activity } from "@/lib/activities";
import ListRow from "./ListRow";
import {
  MEMBER_COLORS,
  formatMeta,
  effectiveDayOfWeek,
  type MemberAvailability,
} from "./activities-utils";

interface Props {
  activity: Activity;
  members?: [MemberAvailability, MemberAvailability];
}

/**
 * An event or place in the List view, in the shared ListRow layout (same as
 * the map popups): type chip, title, a coral meta line (events: date/time —
 * neighborhood; places: neighborhood/area — never a street address), the
 * description, who's free (events), "By <organization>", and
 * "Check it out →" when there's a link.
 */
export default function ActivityCard({ activity, members }: Props) {
  const isEvent = activity.kind === "event";
  const description = isEvent
    ? (activity.newsletter_description ?? activity.description)
    : activity.description;
  const meta = isEvent ? formatMeta(activity) : activity.neighborhood ?? activity.area ?? null;

  const eventDay = isEvent ? effectiveDayOfWeek(activity) : null;
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
    <ListRow
      kind={isEvent ? "event" : "place"}
      title={activity.title}
      highlight={activity.isRecommended}
      belowImage={
        freeMembers.length > 0 && (
          <div className="flex gap-0.5">
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
        )
      }
      meta={meta}
      description={description}
      mapsUrl={activity.lat != null && activity.lng != null ? `https://www.google.com/maps?q=${activity.lat},${activity.lng}` : null}
      extras={
        activity.organization && <p className="text-xs text-muted">By {activity.organization}</p>
      }
      action={activity.url ? { label: "Check it out", href: activity.url, external: true } : null}
    />
  );
}
