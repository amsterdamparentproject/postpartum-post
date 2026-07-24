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
