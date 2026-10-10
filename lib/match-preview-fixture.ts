import type { MatchMemberView } from "@/app/actions/match-page";
import type { Activity, Playground } from "@/lib/activities";
import { toLocalDateStr } from "@/app/matches/[id]/activities-utils";

/**
 * Fictional data for the sample match on the homepage
 * (components/MatchPreview.tsx). Typed against the real match page's own
 * types, so if those change the build fails here instead of the preview
 * quietly drifting. Never built from a real match. The places, events and
 * playgrounds are invented and sit around a made-up halfway point in
 * west Amsterdam; only the Post Perks in the preview are real.
 */

export const PREVIEW_MEMBERS: [MatchMemberView, MatchMemberView] = [
  {
    first_name: "Alex",
    last_name: "",
    email: "alex@example.com",
    availability: { days: ["wednesday", "saturday"], times: ["morning"] },
  },
  {
    first_name: "Mike",
    last_name: "",
    email: "mike@example.com",
    availability: { days: ["wednesday", "friday", "saturday"], times: ["morning"] },
  },
];

/** The made-up halfway point the sample map is centered on. */
export const PREVIEW_CENTER = { lat: 52.3625, lng: 4.866 };

const base = {
  url: null,
  organization: null,
  location: null,
  categories: [],
  age_categories: [],
  score: 0,
} satisfies Partial<Activity>;

/** The next date (today included) that falls on `dow` (0 = Sunday), as YYYY-MM-DD. */
function nextDate(dow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return toLocalDateStr(d);
}

/** The sample match's data, with events dated relative to today so the calendar always has some. */
export function buildPreviewMatch() {
  const { lat, lng } = PREVIEW_CENTER;

  const recommendedPlaces: Activity[] = [
    {
      ...base,
      id: "preview-place-1",
      kind: "location",
      title: "Neighborhood Coffee Corner",
      description:
        "Stroller-accessible, kids corner, and great coffee for the parents. Next to a playground if the weather is nice!",
      neighborhood: "Halfway between you",
      area: null,
      lat: lat + 0.002,
      lng: lng - 0.003,
      score: 9,
      isRecommended: true,
    },
    {
      ...base,
      id: "preview-place-2",
      kind: "location",
      title: "Toddler Play Gym",
      description:
        "A wide-open soft play space that has a ton of room to run around. Great for a rainy day meetup.",
      neighborhood: "Close to you both",
      area: null,
      lat: lat - 0.003,
      lng: lng + 0.004,
      score: 8,
      isRecommended: true,
    },
  ];

  const event = (
    id: string,
    title: string,
    description: string,
    dow: number,
    start: string,
    end: string,
    dLat: number,
    dLng: number,
    score: number,
  ): Activity => ({
    ...base,
    id,
    kind: "event",
    title,
    description,
    neighborhood: "Near you both",
    area: null,
    lat: lat + dLat,
    lng: lng + dLng,
    start_date: nextDate(dow),
    repeat_next_date: nextDate(dow),
    repeat_rrule: "FREQ=WEEKLY",
    start_time: start,
    end_time: end,
    score,
    isRecommended: true,
  });

  const recommendedActivities: Activity[] = [
    event("preview-event-1", "Baby & toddler music morning", "Songs, shakers and snacks for the littlest ones.", 3, "10:00", "11:00", 0.004, 0.001, 9),
    event("preview-event-2", "Stroller walk & coffee", "A relaxed loop through the park, coffee after.", 6, "09:30", "10:30", -0.001, -0.005, 8),
    event("preview-event-3", "Open play morning", "Drop-in play for babies and toddlers, with a parent corner.", 3, "11:00", "12:30", -0.004, 0.002, 7),
  ];

  const playgrounds: Playground[] = [
    { id: "preview-pg-1", name: "Neighborhood playground", lat: lat + 0.001, lng: lng + 0.002, playground_type: "play_spot", distanceKm: 0.2 },
    { id: "preview-pg-2", name: "Park playground", lat: lat - 0.002, lng: lng - 0.004, playground_type: "adventure_playground", distanceKm: 0.4 },
    { id: "preview-pg-3", name: "Square playground", lat: lat + 0.005, lng: lng - 0.001, playground_type: "play_spot", distanceKm: 0.6 },
  ];

  return {
    matchedOn: toLocalDateStr(new Date()),
    recommendedPlaces,
    recommendedActivities,
    allActivities: recommendedActivities,
    playgrounds,
  };
}
