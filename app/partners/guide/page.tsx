"use client";

import PartnerLoginRequest from "@/components/PartnerLoginRequest";
import PartnerGuide from "@/components/PartnerGuide";
import { usePartner } from "@/app/partners/PartnerContext";

export default function PartnerGuidePage() {
  const { loading, email, partner, accessToken } = usePartner();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!email || !partner || !accessToken) return <PartnerLoginRequest />;

  return <PartnerGuide />;
}
