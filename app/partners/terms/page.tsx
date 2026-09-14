"use client";

import PartnerLoginRequest from "@/components/PartnerLoginRequest";
import PartnerTerms from "@/components/PartnerTerms";
import { usePartner } from "@/app/partners/PartnerContext";

export default function PartnerTermsPage() {
  const { loading, email, partner, accessToken } = usePartner();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!email || !partner || !accessToken) return <PartnerLoginRequest />;

  return <PartnerTerms />;
}
