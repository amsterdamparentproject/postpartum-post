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

const AGE_CATEGORY_ORDER = ["expecting", "newborn", "baby", "toddler", "all ages"];

/**
 * An event or place in the List view, in the shared ListRow layout (same as
 * the map popups): type chip, title, a coral meta line (events: date/time —
 * neighborhood; places: neighborhood/area — never a street address), the
 * description, who's free (events), "By <organization>", age chips, and
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

  const ageCategories = [...activity.age_categories].sort((a, b) => {
    const ai = AGE_CATEGORY_ORDER.indexOf(a);
    const bi = AGE_CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <ListRow
      kind={isEvent ? "event" : "place"}
      title={activity.title}
      highlight={activity.isRecommended}
      chipAside={
        freeMembers.length > 0 && (
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
        )
      }
      meta={meta}
      description={description}
      extras={
        (activity.organization || ageCategories.length > 0) && (
          <div className="space-y-1">
            {activity.organization && <p className="text-xs text-muted">By {activity.organization}</p>}
            {ageCategories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ageCategories.map((cat) => (
                  <span key={cat} className="px-2 py-0.5 rounded-full bg-border/50 text-muted text-[11px]">
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      }
      action={activity.url ? { label: "Check it out", href: activity.url, external: true } : null}
    />
  );
}
