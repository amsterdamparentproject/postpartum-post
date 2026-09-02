"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { isOptinWindowOpen, daysLeftToOptin } from "@/lib/optin-window";
import OptinBannerBar from "@/components/OptinBannerBar";

/**
 * Logged-out nudge shown above the header on every page during the 1st-5th
 * opt-in window. Covers visitors who sign up after that day's opt-in email
 * batch has already gone out (see app/api/send-optin-email) - without this,
 * they'd have no way to know they can still make this month's match if
 * they join before the deadline.
 *
 * Hides itself once a Supabase session is found, so a signed-in member
 * never sees a "sign up" banner - OptinReminderBanner covers members instead.
 */
export default function JoinReminderBanner() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isOptinWindowOpen()) return;

    let cancelled = false;
    createBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && !data.session) setDaysLeft(daysLeftToOptin());
      })
      .catch(() => {
        // If we can't tell either way, don't nag someone who might already be a member.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!daysLeft || dismissed) return null;

  return (
    <OptinBannerBar onDismiss={() => setDismissed(true)}>
      <p className="text-sm md:text-base text-dark leading-relaxed">
        {"📣"} <b>Want to meet someone new? </b>You have {daysLeft} {daysLeft === 1 ? "day" : "days"} left to join and get matched this month!{" "}
        <Link
          href="/#subscribe"
          data-umami-event="Banner: Join before deadline"
          className="text-coral font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          Sign up now
        </Link>
      </p>
    </OptinBannerBar>
  );
}
