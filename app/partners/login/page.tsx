"use client";

import PartnerLoginRequest from "@/components/PartnerLoginRequest";

/**
 * Dedicated sign-in page for existing partners. Split out of PartnerSplash,
 * which used to embed a compact PartnerLoginRequest widget inline alongside
 * the public pitch content — that made the logged-out /partners page do
 * double duty as both a marketing page and a sign-in screen. PartnerSplash
 * now just links here ("Are you an existing partner? Manage your perks
 * here"); this page owns the actual sign-in + not-found-lead-form flow,
 * same as the fallback already used on /partners/perks.
 */
export default function PartnerLoginPage() {
  return <PartnerLoginRequest />;
}
