"use client";

import PartnerLoginRequest from "@/components/PartnerLoginRequest";
import PartnerPerksManager from "@/components/PartnerPerksManager";
import { usePartner } from "@/app/partners/PartnerContext";

export default function PartnerPerksPage() {
  const { loading, email, partner, accessToken } = usePartner();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!email || !partner || !accessToken) return <PartnerLoginRequest />;

  return <PartnerPerksManager accessToken={accessToken} locations={partner.locations} />;
}
