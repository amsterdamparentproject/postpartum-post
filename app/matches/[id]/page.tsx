/**
 * GET /matches/[id]?token=<hmac>
 *
 * Private match reveal page. Accessible via signed token only — no login required.
 * Both matched members receive the same link in their reveal email.
 *
 * Shows:
 *   - Both members' names and contact emails
 *   - Match type (coffee / playdate / online)
 *   - Activities:
 *       With coordinates → nearby upcoming events (3 km bounding box) + featured activities
 *       No coordinates  → featured activities only
 *
 * Location display: uses `location` (address) if set, falls back to
 * `neighborhood`, then `area`.
 *
 * Activities are fetched best-effort — if the query fails the page still
 * renders with match contact info.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import { createAdminClient, createActivitiesClient } from "@/lib/supabase";
import { verifyMatchToken } from "@/lib/match-token";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

interface ActivityEvent {
  id: string;
  title: string;
  description: string;
  url: string | null;
  organization: string | null;
  location: string | null;
  neighborhood: string | null;
  area: string | null;
  start_date: string;
  start_time: string | null;
  tagline: string | null;
  repeat_next_date?: string | null;
}

interface ActivityResource {
  id: string;
  title: string;
  description: string;
  url: string | null;
  organization: string | null;
  location: string | null;
  neighborhood: string | null;
  area: string | null;
}

const MATCH_TYPE_LABEL: Record<string, string> = {
  in_person: "in person",
  online: "online",
};

function locationText(item: { location: string | null; neighborhood: string | null; area: string | null }): string | null {
  return item.location ?? item.neighborhood ?? item.area ?? null;
}

function formatEventDate(startDate: string, startTime: string | null): string {
  const date = new Date(startDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!startTime) return date;
  return `${date} · ${startTime.slice(0, 5)}`;
}

/** Bounding box half-widths for ~3 km radius. 1° lat ≈ 111 km; 1° lng ≈ 74 km at 52°N. */
const GEO_DELTA_LAT = 3 / 111;
const GEO_DELTA_LNG = 3 / 74;

interface Coords { lat: number; lng: number }

async function fetchActivities(center: Coords | null, matchedOn: string): Promise<{
  nearbyEvents: ActivityEvent[];
  featured: { events: ActivityEvent[]; resources: ActivityResource[] };
}> {
  try {
    const client = createActivitiesClient();
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = matchedOn.slice(0, 7) + "-01";
    const monthEnd = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1))
      .toISOString()
      .slice(0, 10);

    // Featured activities — always fetched; filtered in JS since the list is small
    const featuredResult = await client
      .from("featured_activities")
      .select(`
        event_id,
        resource_id,
        events ( id, title, description, url, organization, location, neighborhood, area, start_date, start_time, tagline, repeat_next_date ),
        resources ( id, title, description, url, organization, location, neighborhood, area )
      `);

    const inMonth = (e: ActivityEvent) =>
      (e.start_date >= monthStart && e.start_date < monthEnd) ||
      (e.repeat_next_date != null && e.repeat_next_date >= monthStart && e.repeat_next_date < monthEnd);

    const featuredEvents = (featuredResult.data ?? [])
      .filter((row) => row.event_id != null)
      .map((row) => row.events as ActivityEvent | null)
      .filter((e): e is ActivityEvent => e !== null && inMonth(e));

    const featuredResources = (featuredResult.data ?? [])
      .filter((row) => row.resource_id != null)
      .map((row) => row.resources as ActivityResource | null)
      .filter((r): r is ActivityResource => r !== null);

    // Nearby upcoming events — only when coordinates are available
    let nearbyEvents: ActivityEvent[] = [];
    if (center) {
      const { data } = await client
        .from("events")
        .select("id, title, description, url, organization, location, neighborhood, area, start_date, start_time, tagline")
        .eq("status", "edited")
        .gte("start_date", today)
        .gte("latitude", center.lat - GEO_DELTA_LAT)
        .lte("latitude", center.lat + GEO_DELTA_LAT)
        .gte("longitude", center.lng - GEO_DELTA_LNG)
        .lte("longitude", center.lng + GEO_DELTA_LNG)
        .order("start_date", { ascending: true })
        .limit(5);
      nearbyEvents = (data ?? []) as ActivityEvent[];
    }

    return {
      nearbyEvents,
      featured: { events: featuredEvents, resources: featuredResources },
    };
  } catch {
    return { nearbyEvents: [], featured: { events: [], resources: [] } };
  }
}

export default async function MatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;

  if (!token || !verifyMatchToken(id, token)) {
    notFound();
  }

  const supabase = createAdminClient();

  const { data: match, error } = await supabase
    .from("matches")
    .select(`
      id,
      match_type,
      matched_on,
      member1:member_id_1 ( first_name, last_name, email, lat, lng ),
      member2:member_id_2 ( first_name, last_name, email, lat, lng )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error || !match) notFound();

  const m1 = match.member1 as { first_name: string; last_name: string; email: string; lat: number | null; lng: number | null } | null;
  const m2 = match.member2 as { first_name: string; last_name: string; email: string; lat: number | null; lng: number | null } | null;

  if (!m1 || !m2) notFound();

  const center: Coords | null =
    m1.lat != null && m1.lng != null && m2.lat != null && m2.lng != null
      ? { lat: (m1.lat + m2.lat) / 2, lng: (m1.lng + m2.lng) / 2 }
      : m1.lat != null && m1.lng != null ? { lat: m1.lat, lng: m1.lng }
      : m2.lat != null && m2.lng != null ? { lat: m2.lat, lng: m2.lng }
      : null;

  const { nearbyEvents, featured } = await fetchActivities(center, match.matched_on);

  const matchedOn = new Date(match.matched_on);
  const monthLabel = matchedOn.toLocaleString("en-US", { month: "long", year: "numeric" });
  const meetingLabel = match.match_type ? MATCH_TYPE_LABEL[match.match_type] ?? match.match_type : null;

  const hasActivities = nearbyEvents.length > 0 || featured.events.length > 0 || featured.resources.length > 0;

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="max-w-lg w-full space-y-12">

          {/* Header */}
          <div className="text-center space-y-2">
            <p className="text-muted text-sm uppercase tracking-wide">{monthLabel}</p>
            <h1
              className="text-3xl font-semibold text-dark"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your match is here 💌
            </h1>
            {meetingLabel && (
              <p className="text-muted text-sm">You&apos;re meeting {meetingLabel} this month</p>
            )}
          </div>

          {/* Match cards */}
          <section className="space-y-4">
            {[m1, m2].map((member, i) => (
              <div key={i} className="border border-border rounded-xl p-6 bg-white space-y-1">
                <p className="font-semibold text-dark text-lg">
                  {member.first_name} {member.last_name}
                </p>
                <a href={`mailto:${member.email}`} className="text-coral hover:underline text-sm">
                  {member.email}
                </a>
              </div>
            ))}
          </section>

          {/* Activities */}
          {hasActivities && (
            <section className="space-y-8">
              <h2
                className="text-xl font-semibold text-dark"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Things to do
              </h2>

              {/* Nearby upcoming events */}
              {nearbyEvents.length > 0 && (
                <div className="space-y-3">
                  <p className="text-muted text-xs uppercase tracking-wide">Nearby this month</p>
                  {nearbyEvents.map((event) => {
                    const loc = locationText(event);
                    return (
                      <div key={event.id} className="border border-border rounded-xl p-5 bg-white space-y-1">
                        <p className="font-semibold text-dark text-sm">
                          {event.url
                            ? <a href={event.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{event.title}</a>
                            : event.title}
                        </p>
                        <p className="text-muted text-xs">
                          {formatEventDate(event.start_date, event.start_time)}
                          {loc && <> · {loc}</>}
                          {event.organization && <> · {event.organization}</>}
                        </p>
                        <p className="text-dark text-sm leading-relaxed">{event.tagline ?? event.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Featured events */}
              {featured.events.length > 0 && (
                <div className="space-y-3">
                  <p className="text-muted text-xs uppercase tracking-wide">Our picks this month</p>
                  {featured.events.map((event) => {
                    const loc = locationText(event);
                    return (
                      <div key={event.id} className="border border-border rounded-xl p-5 bg-white space-y-1">
                        <p className="font-semibold text-dark text-sm">
                          {event.url
                            ? <a href={event.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{event.title}</a>
                            : event.title}
                        </p>
                        <p className="text-muted text-xs">
                          {formatEventDate(event.start_date, event.start_time)}
                          {loc && <> · {loc}</>}
                          {event.organization && <> · {event.organization}</>}
                        </p>
                        <p className="text-dark text-sm leading-relaxed">{event.tagline ?? event.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Featured resources */}
              {featured.resources.length > 0 && (
                <div className="space-y-3">
                  <p className="text-muted text-xs uppercase tracking-wide">Local resources</p>
                  {featured.resources.map((resource) => {
                    const loc = locationText(resource);
                    return (
                      <div key={resource.id} className="border border-border rounded-xl p-5 bg-white space-y-1">
                        <p className="font-semibold text-dark text-sm">
                          {resource.url
                            ? <a href={resource.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{resource.title}</a>
                            : resource.title}
                        </p>
                        {(loc || resource.organization) && (
                          <p className="text-muted text-xs">
                            {[resource.organization, loc].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <p className="text-dark text-sm leading-relaxed">{resource.description}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Rematch */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-muted text-sm mb-3">
              Not feeling the connection? You can request a rematch before the 14th.
            </p>
            <Link href="/matches" className="text-sm text-coral hover:underline">
              Go to your profile to request a rematch
            </Link>
          </div>

        </div>
      </main>
    </PageLayout>
  );
}
