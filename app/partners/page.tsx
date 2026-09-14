"use client";

import PartnerSplash from "@/components/PartnerSplash";
import PartnerContactForm from "@/components/PartnerContactForm";
import PartnerProfileForm from "@/components/PartnerProfileForm";
import PartnerLocationsManager from "@/components/PartnerLocationsManager";
import { usePartner } from "@/app/partners/PartnerContext";

/**
 * /partners doubles as both the login gate and the Profile tab — mirrors
 * /profile's own double duty (MagicLinkRequest when signed out, profile UI
 * when signed in). No "not subscribed" middle state here: a partners row
 * existing at all IS the access grant, there's no separate billing status
 * to check (see lib/require-partner.ts's docblock).
 */
export default function PartnersPage() {
  const { loading, email, partner, accessToken, refresh } = usePartner();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!email || !partner || !accessToken) return <PartnerSplash />;

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
