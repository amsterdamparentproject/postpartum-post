import { createBrowserClient } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Verifies a Supabase magic-link OTP token hash in the browser.
 * Returns null on success, or an error message string on failure.
 *
 * Used by app/auth/confirm/page.tsx — the landing page for magic links
 * that are built with {{ .TokenHash }} instead of {{ .ConfirmationURL }},
 * so the link points to postpartumpost.com rather than the Supabase project URL.
 */
export async function verifyMagicLinkToken(
  tokenHash: string,
  type: string
): Promise<string | null> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });
  return error?.message ?? null;
}
