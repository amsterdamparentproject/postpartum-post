/**
 * GET /matches/[id]?token=<hmac>
 *
 * Private match reveal page. Accessible via signed token only — no login required.
 * Both matched members receive the same link in their reveal email.
 *
 * Shows:
 *   - Both members' names and contact emails
 *   - Topic (coffee / playdate)
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
import PageLayout from "@/components/PageLayout";
import { createAdminClient } from "@/lib/supabase";
import { verifyMatchToken } from "@/lib/match-token";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import { fetchMatchActivities, childAgeBucket } from "@/lib/activities";
import ActivitiesSection from "@/app/matches/[id]/ActivitiesSection";
import MonthlyWhimsy from "@/app/matches/[id]/MonthlyWhimsy";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

interface Coords { lat: number; lng: number }

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
      member_id_1,
      member_id_2,
      matched_on,
      rematch_requested,
      member1:member_id_1 ( first_name, last_name, email, lat, lng, availability, children ),
      member2:member_id_2 ( first_name, last_name, email, lat, lng, availability, children )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error || !match) notFound();

  if (match.rematch_requested) {
    return (
      <PageLayout>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="max-w-md space-y-4">
            <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
            <h1
              className="text-3xl font-semibold text-dark"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              This match has ended
            </h1>
            <p className="text-muted leading-relaxed">
              Your match for this month has changed.
            </p>
            <a
              href="/matches"
              className="inline-block mt-2 rounded-lg bg-coral text-white text-sm font-medium px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Go to your matches
            </a>
          </div>
        </main>
      </PageLayout>
    );
  }

  type MatchMember = {
    first_name: string;
    last_name: string;
    email: string;
    lat: number | null;
    lng: number | null;
    availability: { days: string[]; times: string[] } | null;
    children: { birth_month: number; birth_year: number; expected: boolean }[] | null;
  };
  const m1 = (Array.isArray(match.member1) ? match.member1[0] : match.member1) as MatchMember | null;
  const m2 = (Array.isArray(match.member2) ? match.member2[0] : match.member2) as MatchMember | null;

  if (!m1 || !m2) notFound();

  const center: Coords | null =
    m1.lat != null && m1.lng != null && m2.lat != null && m2.lng != null
      ? { lat: (m1.lat + m2.lat) / 2, lng: (m1.lng + m2.lng) / 2 }
      : m1.lat != null && m1.lng != null ? { lat: m1.lat, lng: m1.lng }
      : m2.lat != null && m2.lng != null ? { lat: m2.lat, lng: m2.lng }
      : null;

  // Union of both members' availability days for scoring
  const availabilityDays = Array.from(new Set([
    ...(m1.availability?.days ?? []),
    ...(m2.availability?.days ?? []),
  ]));

  const { recommendedPlaces, recommendedActivities, all: allActivities, playgrounds } =
    await fetchMatchActivities({
      center,
      availabilityDays,
      member1Days: m1.availability?.days ?? [],
      member2Days: m2.availability?.days ?? [],
      member1Children: m1.children ?? [],
      member2Children: m2.children ?? [],
      matchedOn: match.matched_on,
    });

  const matchedOn = new Date(match.matched_on);
  const monthLabel = matchedOn.toLocaleString("en-US", { month: "long", year: "numeric" });

  const hasActivities = recommendedActivities.length > 0 || allActivities.length > 0 || playgrounds.length > 0;

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="max-w-2xl px-4 md:px-0 w-full space-y-16">

          {/* Header */}
          <div className="text-center space-y-2">
            <EnvelopeLogo width={48} height={36} className="hidden sm:block mx-auto mb-4" />
            <h1
              className="text-4xl sm:text-5xl font-semibold text-dark"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Your <span className="text-coral">{monthLabel}</span> match<span className="hidden md:inline"><br /></span> is here!
            </h1>
          </div>

          {/* Match cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[m1, m2].map((member, i) => {
              const days = member.availability?.days ?? [];
              const dayLabels = days.map((d) =>
                d.charAt(0).toUpperCase() + d.slice(1, 3).toLowerCase()
              );
              const borderColor = i === 0 ? "#C56850" : "#9B7355";
              const radius = i === 0
                ? "2rem 0.5rem 2rem 0.5rem / 0.5rem 2rem 0.5rem 2rem"
                : "0.5rem 2rem 0.5rem 2rem / 2rem 0.5rem 2rem 0.5rem";
              return (
                <div
                  key={i}
                  className="p-5 bg-white space-y-2"
                  style={{ borderRadius: radius, border: `1.5px solid ${borderColor}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-dark text-lg" style={{ fontFamily: "var(--font-serif)" }}>
                      {member.first_name} {member.last_name}
                    </p>
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shrink-0"
                      style={{ background: borderColor }}
                    >
                      {member.first_name[0].toUpperCase()}
                    </span>
                  </div>
                  <a href={`mailto:${member.email}`} className="text-purple hover:underline text-sm block">
                    Send them an email →
                  </a>
                  <p className="text-muted text-xs flex items-center gap-1">
                    {dayLabels.length > 0
                      ? `Available on: ${dayLabels.join(", ")}`
                      : "Available on: Not specified"
                    }
                    <a href="/profile" title="Edit availability" target="_blank" rel="noopener noreferrer" style={{ color: borderColor }} className="ml-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </a>
                  </p>
                  {process.env.NODE_ENV === "development" && (() => {
                    const children = member.children ?? [];
                    const buckets = children
                      .map(childAgeBucket)
                      .filter((b): b is string => b !== null)
                      .map((b) => b.charAt(0).toUpperCase() + b.slice(1));
                    return (
                      <p className="text-muted text-xs">
                        {`Children: ${buckets.length > 0 ? buckets.join(", ") : "Not specified"}`}
                      </p>
                    );
                  })()}
                </div>
              );
            })}
          </section>

{/* Activities */}
          {hasActivities && (
            <ActivitiesSection
              recommendedPlaces={recommendedPlaces}
              recommendedActivities={recommendedActivities}
              all={allActivities}
              center={center}
              memberCoords={[
                ...(m1.lat != null && m1.lng != null ? [{ lat: m1.lat, lng: m1.lng }] : []),
                ...(m2.lat != null && m2.lng != null ? [{ lat: m2.lat, lng: m2.lng }] : []),
              ]}
              members={[
                { name: m1.first_name, days: m1.availability?.days ?? [] },
                { name: m2.first_name, days: m2.availability?.days ?? [] },
              ]}
              matchedOn={match.matched_on}
              playgrounds={playgrounds}
            />
          )}

          <MonthlyWhimsy />

{/* About matching */}
          <div className="pt-4 pb-2" id="about-matching">
            <h2
              className="text-2xl sm:text-3xl font-normal text-dark"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              About the matching process
            </h2>
            <p className="my-3">
              We find your connection each month through an algorithm specifically created for Postpartum Post (no AI!). It scores profiles across the entire pool of parents who want to meet. 
              It’s looking for the <span className="font-semibold text-coral">best outcomes for the whole community</span> — which means that not every individual match may be perfect ❤️ 
            </p>
            <p className="mb-3">
              Language, mom/dad preferences, and availability rank most highly. When creating every match, we can only account for the profile information that we have. If something is really not working out, you can always{" "}
              <a href={`/rematch?match_id=${id}`} className="text-coral hover:underline">
                request a rematch
              </a>.
            </p>
          </div>

          {/* Feedback */}
          <div className="text-center">
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLScslq1CKK6FCg6jMyNaPBKn1xCwMT44y-yQb5KOS_K3FSLHzQ/viewform?usp=dialog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-coral text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Leave match feedback
            </a>
          </div>

          {/* Rematch */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-muted text-sm mb-3">
              Something not working this month? You can request a rematch before the 14th — your match is not notified, and your contact info remains hidden from this match going forward.
            </p>
            <a href={`/rematch?match_id=${id}`} className="text-sm text-coral hover:underline">
              Request a rematch
            </a>
          </div>

        </div>
      </main>
    </PageLayout>
  );
}
