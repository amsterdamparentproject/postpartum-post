import { createAdminClient } from "@/lib/supabase";

export type AuthedPartner = { partnerId: string; email: string };

/**
 * The single authorization primitive for partner-portal server actions.
 * Mirrors lib/require-member.ts exactly, keyed on postpartumpost.partners
 * instead of members — same Supabase magic-link session, same "verify the
 * token server-side, resolve identity by email, never trust a
 * client-supplied id" rule (see __claude__/security-audit-2026-07-24.md,
 * Finding 1 — that finding applies here just as much as it does to members).
 *
 * A partner never gets a subscriptions check — unlike requireMember(),
 * there's no billing status to gate on here at all.
 *
 * Returns null when the token is missing, invalid/expired, or resolves to
 * no matching partners row (including a partner that exists but has no
 * email set yet — same as "no portal access").
 *
 *   const authed = await requirePartner(accessToken);
 *   if (!authed) return null;
 *   // ...use authed.partnerId — never a client-supplied id
 */
export async function requirePartner(
  accessToken: string,
): Promise<AuthedPartner | null> {
  if (!accessToken) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    console.error("[requirePartner] auth.getUser failed:", error.message);
  }
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;

  const { data: partner } = await supabase
    .from("partners")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!partner) return null;

  return { partnerId: partner.id as string, email };
}
