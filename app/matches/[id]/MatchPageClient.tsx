"use client";

/**
 * Client-side shell for the private match reveal page.
 *
 * The match ID + link token alone are no longer enough to see contact
 * details — the viewer must be signed in as one of this match's two
 * members. This component checks the browser's Supabase session, then asks
 * the server (via getMatchPageData) to independently verify that session's
 * access token and return data only if it belongs to one of the two members
 * on this specific match.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { getMatchPageData, type MatchPageResult } from "@/app/actions/match-page";
import PageLayout from "@/components/PageLayout";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import CalloutBox from "@/components/CalloutBox";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import ActivitiesSection from "@/app/matches/[id]/ActivitiesSection";

interface Props {
  matchId: string;
  token?: string;
  /** Non-sensitive server-rendered content (e.g. MonthlyWhimsy) passed through as-is. */
  monthlyWhimsy?: React.ReactNode;
}

type ReadyResult = Extract<MatchPageResult, { authorized: true; rematchRequested: false }>;

export default function MatchPageClient({ matchId, token, monthlyWhimsy }: Props) {
  const [result, setResult] = useState<MatchPageResult | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let ignore = false;
    const supabase = createBrowserClient();

    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (ignore) return;

      if (!session?.access_token) {
        setResult({ authorized: false, reason: "not_signed_in" });
        setChecking(false);
        return;
      }

      const data = await getMatchPageData(matchId, token ?? "", session.access_token);
      if (ignore) return;
      setResult(data);
      setChecking(false);
    }

    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [matchId, token]);

  if (checking || !result) {
    return (
      <PageLayout>
        <main className="flex-1 flex items-center justify-center px-6 py-16">
          <p className="text-muted text-sm">Loading your match…</p>
        </main>
      </PageLayout>
    );
  }

  if (!result.authorized) {
    if (result.reason === "not_signed_in") {
      const redirectTo = `${window.location.pathname}${window.location.search}`;
      return (
        <PageLayout>
          <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
            <div className="max-w-sm w-full space-y-4 text-center mb-2">
              <EnvelopeLogo width={48} height={36} className="mx-auto mb-2" />
              <h1
                className="text-2xl text-dark"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Sign in to see your match
              </h1>
              <p className="text-muted text-sm leading-relaxed">
                This page is private to the two of you — sign in with the email you subscribed with to view it.
              </p>
            </div>
            <MagicLinkRequest redirectTo={redirectTo} />
          </main>
        </PageLayout>
      );
    }

    if (result.reason === "forbidden") {
      return (
        <PageLayout>
          <main className="flex-1 flex items-center justify-center px-6 py-16 text-center">
            <CalloutBox className="max-w-sm">
              <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
              <h1
                className="text-xl text-dark mb-2"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                This isn&apos;t your match
              </h1>
              <p className="text-muted text-sm leading-relaxed mb-4">
                You&apos;re signed in, but this match page belongs to different members. If you think that&apos;s wrong, reach out at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="text-coral hover:underline">
                  post@amsterdamparentproject.nl
                </a>.
              </p>
              <Link href="/matches" className="text-sm text-coral hover:underline">
                Go to your matches
              </Link>
            </CalloutBox>
          </main>
        </PageLayout>
      );
    }

    // reason === "invalid" — bad token / unknown match ID
    return (
      <PageLayout>
        <main className="flex-1 flex items-center justify-center px-6 py-16 text-center">
          <CalloutBox className="max-w-sm">
            <h1
              className="text-xl text-dark mb-2"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              This link isn&apos;t valid
            </h1>
            <p className="text-muted text-sm leading-relaxed">
              Double-check the link from your match email, or visit your matches page directly.
            </p>
          </CalloutBox>
        </main>
      </PageLayout>
    );
  }

  if (result.rematchRequested) {
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
            <Link
              href="/matches"
              className="inline-block mt-2 rounded-lg bg-coral text-white text-sm font-medium px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Go to your matches
            </Link>
          </div>
        </main>
      </PageLayout>
    );
  }

  return <MatchPageReady data={result} matchId={matchId} monthlyWhimsy={monthlyWhimsy} />;
}

function MatchPageReady({
  data,
  matchId,
  monthlyWhimsy,
}: {
  data: ReadyResult;
  matchId: string;
  monthlyWhimsy?: React.ReactNode;
}) {
  const { m1, m2, monthLabel, matchedOn, viewerIsM1, viewerIsInitiator, viewerMemberId, topic, hasActivities, recommendedPlaces, recommendedActivities, allActivities, center, memberCoords, playgrounds } = data;

  const them = viewerIsM1 ? m2 : m1;

  const mailtoSubject = encodeURIComponent(`Let's meet for a ${topic || "hang"}! (Postpartum Post)`);
  const mailtoBody = encodeURIComponent(`Hi ${them.first_name},`);
  const mailtoHref = `mailto:${them.email}?subject=${mailtoSubject}&body=${mailtoBody}`;
  const rematchHref = `/rematch?member_id=${viewerMemberId}&match_id=${matchId}`;

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="max-w-2xl px-4 md:px-0 w-full space-y-16">

          {/* Header, welcome blurb, match cards, and get-started — grouped so
              the gaps between them can be tighter than the space-y-16 rhythm
              used between the page's main sections further down. */}
          <div className="space-y-10">

          <div className="space-y-8">

          {/* Header */}
          <div className="text-center space-y-2">
            <EnvelopeLogo width={48} height={36} className="hidden sm:block mx-auto mb-4" />
            <h1
              className="text-4xl sm:text-5xl font-semibold text-dark"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {m1.first_name} <span className="text-coral">&</span> {m2.first_name}
            </h1>
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="w-8 h-px bg-border" />
              <h2 className="text-sm text-muted">{monthLabel}</h2>
              <span className="w-8 h-px bg-border" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-center text-muted leading-relaxed max-w-xl mx-auto">
              Welcome to your {monthLabel}&nbsp;match page! You&apos;ll find contact details, your availability calendar, and activities that have been selected based on your specific profiles — shared just between the two of you.
            </p>
          </div>
          </div>

          {/* Match cards + get started — grouped so the gap between them can be
              tighter than the space-y-16 rhythm used between page sections. */}
          <div className="space-y-10">

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
                  <p className="text-muted text-xs flex items-center gap-1">
                    {dayLabels.length > 0
                      ? `Available on: ${dayLabels.join(", ")}`
                      : "Available on: Not specified"
                    }
                    <a href="/profile" title="Edit availability" target="_blank" rel="noopener noreferrer" style={{ color: borderColor }} className="ml-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </a>
                  </p>
                  <CopyEmailButton email={member.email} />
                </div>
              );
            })}
          </section>

          <div className="pb-2 text-center">
            <p className="my-3">
              {viewerIsInitiator ? (
                <>
                  To skip all that first-contact awkwardness, we select 1 person from the match to initiate the conversation — and it&apos;s you!<span className="text-coral">{" "}Reach out to {them.first_name}{" "} in the next day or so{" "}</span> to start planning your meetup. They&apos;ll be waiting ☺️
                </>
              ) : (
                <>
                  <span className="text-coral">{them.first_name}{" "}has been asked to reach out first this month.</span>{" "}Keep an eye on your inbox over the next day or two, or say hi yourself now ☺️
                </>
              )}
            </p>
            <div className="text-center mt-8">
              <a
                href={mailtoHref}
                className="inline-block bg-coral text-white text-[17.5px] font-medium rounded-lg px-[25px] py-[12.5px] hover:opacity-90 transition-opacity"
              >
                Email {them.first_name}
              </a>
            </div>
          </div>
          </div>
          </div>

          {/* Activities */}
          {hasActivities && (
            <ActivitiesSection
              recommendedPlaces={recommendedPlaces}
              recommendedActivities={recommendedActivities}
              all={allActivities}
              center={center}
              memberCoords={memberCoords}
              members={[
                { name: m1.first_name, days: m1.availability?.days ?? [] },
                { name: m2.first_name, days: m2.availability?.days ?? [] },
              ]}
              matchedOn={matchedOn}
              playgrounds={playgrounds}
            />
          )}

          {monthlyWhimsy}

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
              <a href={rematchHref} className="text-coral hover:underline">
                request a rematch
              </a>.
            </p>
          </div>

          {/* Feedback */}
          <div className="text-center">
            <Link
              href="/feedback"
              className="inline-block bg-coral text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Leave match feedback
            </Link>
          </div>

          {/* Rematch */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-muted text-sm mb-3">
              Something not working this month? You can request a rematch before the 14th — your match is not notified, and your contact info remains hidden from this match going forward.
            </p>
            <a href={rematchHref} className="text-sm text-coral hover:underline">
              Request a rematch
            </a>
          </div>

        </div>
      </main>
    </PageLayout>
  );
}

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-coral hover:underline text-xs block"
    >
      {copied ? "Copied!" : "Copy contact email"}
    </button>
  );
}
