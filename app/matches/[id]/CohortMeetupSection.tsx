import CalendarView from "@/app/matches/[id]/CalendarView";
import type { MemberAvailability } from "@/app/matches/[id]/activities-utils";
import { LOCAL_MEETUP_KM, type MeetupMode } from "@/lib/meetup-mode";

/**
 * Cohort match pages, for pairs who aren't meeting in person: a short note on
 * how to meet, plus the pair's shared availability calendar (the same calendar
 * as the activities section, with no events). Replaces the activities, map and
 * perks sections (the page doesn't render those for these pairs).
 *
 * - online:  the pair lives too far apart for a coffee, so: video call
 * - unknown: a home location is missing: just the generic "When to meet up" calendar
 *
 * The cohort's conversation starters (CohortMatchPageConfig.starters) are
 * parked: still in the config and the loader, just not shown here yet.
 */
export default function CohortMeetupSection({
  mode,
  members,
  matchedOn,
}: {
  mode: Exclude<MeetupMode, "local">;
  members: [MemberAvailability, MemberAvailability];
  matchedOn: string;
}) {
  // Unknown location: no explainer, just the generic "When to meet up" calendar.
  if (mode === "unknown") {
    return (
      <section className="space-y-4" id="meetup">
        <h2 className="text-2xl sm:text-3xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          When to meet up
        </h2>
        <CalendarView events={[]} members={members} matchedOn={matchedOn} />
      </section>
    );
  }

  return (
    <section className="space-y-6" id="meetup">
      <div className="space-y-3">
        <h2 className="text-2xl sm:text-3xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Meeting by video
        </h2>
        <p className="text-muted leading-relaxed">
          Given the distance between you and your match (more than {LOCAL_MEETUP_KM}km), a video call may be the
          easiest way to meet. Pick a time that works for you both, make yourselves a drink, and say hello ❤️
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          When you&apos;re both free
        </h3>
        <CalendarView events={[]} members={members} matchedOn={matchedOn} />
      </div>
    </section>
  );
}
