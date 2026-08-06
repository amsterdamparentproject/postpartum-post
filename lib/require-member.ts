import { createAdminClient } from "@/lib/supabase";

export type AuthedMember = { memberId: string; email: string };

/**
 * The single authorization primitive for account server actions.
 *
 * Verifies a Supabase access token server-side and resolves the member row it
 * belongs to. Account actions MUST derive identity from here and never trust a
 * client-supplied member id or email — otherwise anyone can act on anyone's
 * account (see __claude__/security-audit-2026-07-24.md, Finding 1). Mirrors the
 * verification already used in app/actions/match-page.ts.
 *
 * Returns null when the token is missing, invalid/expired, or resolves to no
 * matching member row. Usage:
 *
 *   const authed = await requireMember(accessToken);
 *   if (!authed) return null;          // or an error result
 *   // ...use authed.memberId — never a client-supplied id
 */
export async function requireMember(
  accessToken: string,
): Promise<AuthedMember | null> {
  if (!accessToken) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    // Logged distinctly from "no matching member" below — a getUser() failure
    // means the token itself couldn't be verified (expired, malformed, or the
    // kid-less-JWT issue documented in lib/supabase/generate-magic-link.ts for
    // brand-new magic links), not that the person isn't a member. Callers that
    // collapse this into "not a member" (e.g. AccountContext signing the user
    // out and showing NotSubscribedView) can otherwise mislabel a transient
    // auth glitch as "your email isn't associated with a subscription" for a
    // genuinely active member — see the 2026-08 gift-card-opt-in report.
    console.error("[requireMember] auth.getUser failed:", error.message);
  }
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!member) return null;

  return { memberId: member.id as string, email };
}
