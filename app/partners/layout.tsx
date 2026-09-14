"use client";

import PageLayout from "@/components/PageLayout";
import PartnerTabNav from "@/components/PartnerTabNav";
import { PartnerProvider, usePartner } from "@/app/partners/PartnerContext";

/**
 * Mirrors app/(account)/layout.tsx + AccountShell exactly, keyed on
 * partners. Not a route-group layout (no "(partners)" wrapper) — this repo
 * puts partner routes under a real /partners path segment on purpose, per
 * Alex's own framing: "/partners with a log-in screen [...] similar to the
 * /profile UI." /partners itself doubles as the login gate AND the Profile
 * tab (see app/partners/page.tsx), exactly like /profile doubles as
 * MagicLinkRequest-or-profile-UI depending on session state.
 */
function PartnerShell({ children }: { children: React.ReactNode }) {
  const { partner } = usePartner();

  return (
    <PageLayout>
      <main className="flex-1 px-6 pt-8 pb-16 max-w-5xl mx-auto w-full">
        {partner && <PartnerTabNav />}
        {children}
      </main>
    </PageLayout>
  );
}

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerProvider>
      <PartnerShell>{children}</PartnerShell>
    </PartnerProvider>
  );
}
