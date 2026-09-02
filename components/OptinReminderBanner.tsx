"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { getMatchStatus, type MatchStatus } from "@/app/(account)/matches/actions";
import { isOptinWindowOpen, daysLeftToOptin } from "@/lib/optin-window";
import OptinBannerBar from "@/components/OptinBannerBar";

/**
 * Nudges a logged-in member who hasn't responded to this month's opt-in yet.
 * Shown above the header on every page during the 1st-5th window - covers
 * members who joined after the 1st's opt-in email batch already went out,
 * as well as anyone who just hasn't gotten to it.
 *
 * Self-contained (does its own Supabase session check) rather than depending
 * on AccountContext, which only wraps the (account) route group and carries
 * heavier member-profile-fetch / sign-out-on-mismatch side effects this
 * banner doesn't need - that's what lets it render on every page, not just
 * the account section.
 *
 * Links to /matches rather than /profile: that's where the actual
 * coffee/playdate/skip choice lives (OptInCard in matches/page.tsx), so
 * that's where this needs to send them to actually resolve the reminder.
 *
 * Hides itself when there's no session, or once the member has opted in,
 * skipped, or already has a match for this month (getMatchStatus returns
 * anything other than "none").
 */
export default function OptinReminderBanner() {
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isOptinWindowOpen()) return;

    let cancelled = false;
    createBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        const accessToken = data.session?.access_token;
        if (!accessToken) return;
        return getMatchStatus(accessToken).then((result) => {
          if (!cancelled) {
            setStatus(result);
            setDaysLeft(daysLeftToOptin());
          }
        });
      })
      .catch(() => {
        // If we can't tell, don't nag - better to miss a reminder than show one incorrectly.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status?.type !== "none" || !daysLeft || dismissed) return null;

  return (
    <OptinBannerBar onDismiss={() => setDismissed(true)}>
      <p className="text-sm md:text-base text-dark leading-relaxed">
        {"📣"} <b>Coffee or playdate? </b>You have {daysLeft} {daysLeft === 1 ? "day" : "days"} left to opt into your match this month!{" "}
        <Link
          href="/matches"
          data-umami-event="Banner: Opt-in reminder"
          className="text-coral font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          Go to your matches
        </Link>
      </p>
    </OptinBannerBar>
  );
}
