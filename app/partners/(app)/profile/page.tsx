"use client";

import PartnerLoginRequest from "@/components/PartnerLoginRequest";
import PartnerContactForm from "@/components/PartnerContactForm";
import PartnerProfileForm from "@/components/PartnerProfileForm";
import PartnerLocationsManager from "@/components/PartnerLocationsManager";
import { usePartner } from "@/app/partners/PartnerContext";

/**
 * The signed-in partner dashboard — split out of the public /partners
 * splash (see that page's docblock) so the splash never needs to check
 * auth. Not-signed-in here shows PartnerLoginRequest inline, same
 * fallback /partners/perks and /partners/terms already use, rather than a
 * hard redirect — /partners/login is the one place that actively
 * redirects (the other direction: already signed in -> here).
 */
export default function PartnerProfilePage() {
  const { loading, email, partner, accessToken, refresh } = usePartner();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!email || !partner || !accessToken) return <PartnerLoginRequest />;

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
        <PartnerProfileForm partner={partner} accessToken={accessToken} onSaved={refresh} />
      </div>
      <div className="space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <PartnerContactForm partner={partner} accessToken={accessToken} />
        </div>
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <PartnerLocationsManager locations={partner.locations} accessToken={accessToken} />
        </div>
      </div>
    </div>
  );
}
