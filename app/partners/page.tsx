import PartnerSplash from "@/components/PartnerSplash";
import { listPublicPerks } from "@/lib/public-perks";

// Same cadence as /perks; perk writes also refresh it (lib/revalidate-perks.ts).
export const revalidate = 300;

/**
 * Public marketing page — no session check, no PartnerProvider. Its one
 * Supabase read is the live perks for the "most popular" section
 * (server-side, display fields only — lib/public-perks.ts). Used to double as both this splash AND the signed-in
 * profile UI (checking auth on every load to decide which to show); that
 * moved to /partners/profile so this page never has a reason to touch
 * auth at all. An existing partner gets here via PartnerSplash's own
 * "Are you an existing partner?" link to /partners/login, which redirects
 * straight to /partners/profile if they're already signed in.
 */
export default async function PartnersPage() {
  const perks = await listPublicPerks({ liveOnly: true });
  return <PartnerSplash perks={perks} />;
}
