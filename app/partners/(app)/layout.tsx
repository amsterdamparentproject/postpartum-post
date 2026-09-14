"use client";

import PartnerTabNav from "@/components/PartnerTabNav";
import { PartnerProvider, usePartner } from "@/app/partners/PartnerContext";

/**
 * Wraps the authenticated partner section — /partners/login,
 * /partners/profile, /partners/perks, /partners/terms — in PartnerProvider,
 * so the Supabase session check only ever runs for pages that actually
 * need it. /partners itself (the public splash) sits outside this route
 * group on purpose: it's pure marketing content and should never spin up
 * a Supabase client just to render.
 *
 * PageLayout (header/footer/page padding) lives in the parent
 * app/partners/layout.tsx instead of here — that one also needs to stay a
 * server component so it can export metadata, same reason this file is
 * split from it rather than folded together.
 */
function PartnerAppShell({ children }: { children: React.ReactNode }) {
  const { partner } = usePartner();

  return (
    <>
      {partner && <PartnerTabNav />}
      {children}
    </>
  );
}

export default function PartnersAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerProvider>
      <PartnerAppShell>{children}</PartnerAppShell>
    </PartnerProvider>
  );
}
