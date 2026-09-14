import PartnerSplash from "@/components/PartnerSplash";

/**
 * Pure public marketing page — no session check, no Supabase client, no
 * PartnerProvider. Used to double as both this splash AND the signed-in
 * profile UI (checking auth on every load to decide which to show); that
 * moved to /partners/profile so this page never has a reason to touch
 * auth at all. An existing partner gets here via PartnerSplash's own
 * "Are you an existing partner?" link to /partners/login, which redirects
 * straight to /partners/profile if they're already signed in.
 */
export default function PartnersPage() {
  return <PartnerSplash />;
}
