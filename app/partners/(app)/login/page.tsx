"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PartnerLoginRequest from "@/components/PartnerLoginRequest";
import { usePartner } from "@/app/partners/PartnerContext";

/**
 * Dedicated sign-in page for existing partners. Split out of PartnerSplash,
 * which used to embed a compact PartnerLoginRequest widget inline alongside
 * the public pitch content — that made the logged-out /partners page do
 * double duty as both a marketing page and a sign-in screen. PartnerSplash
 * now just links here ("Are you an existing partner? Manage your perks
 * here"); this page owns the actual sign-in + not-found-lead-form flow,
 * same as the fallback already used on /partners/perks.
 *
 * Already signed in? Redirect straight to /partners/profile rather than
 * showing the sign-in form again — e.g. someone who bookmarked this page,
 * or followed PartnerSplash's link while a session from an earlier visit
 * is still valid.
 */
export default function PartnerLoginPage() {
  const { loading, email, partner, accessToken } = usePartner();
  const router = useRouter();
  const alreadySignedIn = !loading && !!email && !!partner && !!accessToken;

  useEffect(() => {
    if (alreadySignedIn) router.replace("/partners/profile");
  }, [alreadySignedIn, router]);

  if (loading || alreadySignedIn) {
    return <p className="text-muted text-sm text-center">Loading…</p>;
  }

  return <PartnerLoginRequest />;
}
