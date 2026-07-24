import type { SupabaseClient } from "@supabase/supabase-js";

// Structurally typed to just the one method this actually calls, rather than
// the full SupabaseClient — createAdminClient() returns a client scoped to
// the "postpartumpost" schema, which otherwise fails to type-check against a
// bare SupabaseClient even though .auth.admin.* isn't affected by schema
// scoping at all.
type GenerateLinkClient = {
  auth: {
    admin: Pick<SupabaseClient["auth"]["admin"], "generateLink">;
  };
};

/**
 * Wraps supabase.auth.admin.generateLink({type: "magiclink"}) with a
 * bounded retry.
 *
 * Diagnosed 2026-07-24: for a brand-new email (no existing auth.users row),
 * generateLink({type: "magiclink"}) can internally take a "signup"-shaped
 * path instead that intermittently mints a JWT with no `kid` header. This
 * project runs a single active ECC (ES256) signing key — GoTrue can't match
 * a token that doesn't specify a `kid` to that key even though it's the only
 * candidate, so verification later fails with "unrecognized JWT kid <nil>
 * for algorithm ES256". Not caused by test-only factors like an
 * @example.com email (Supabase's mail relay rejects that outright with a
 * different, unambiguous SMTP error) — this recurs for real, deliverable
 * addresses too, and in real (non-test) traffic. Looks like a Supabase-side
 * quirk specific to this admin endpoint's brand-new-user path rather than
 * something fixable here — retrying tends to succeed on a later attempt, so
 * this retries rather than failing the whole request outright. A genuine,
 * persistent failure (bad project config, wrong keys, revoked service role
 * key, etc.) still exhausts the retries and returns as a failure.
 */
export async function generateMagicLinkWithRetry(
  supabase: GenerateLinkClient,
  email: string,
  redirectTo: string,
  maxAttempts = 3,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (!error && data.properties?.action_link) {
      return { success: true, url: data.properties.action_link };
    }

    lastError = error?.message ?? "no action_link returned";
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  return {
    success: false,
    error: `generateLink failed after ${maxAttempts} attempts: ${lastError}`,
  };
}
