"use server";

import { createAdminClient } from "@/lib/supabase";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";

/**
 * Generate a Supabase magic link for the given email.
 * Used after onboarding to sign the new member in without requiring them
 * to check their inbox first.
 */
export async function generateMagicLink(email: string): Promise<string> {
  const supabase = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL}/profile`;

  const result = await generateMagicLinkWithRetry(supabase, email, redirectTo);
  if (!result.success) {
    console.error("[generateMagicLink] failed:", result.error);
    // Fall back to plain profile URL — they can sign in from there
    return redirectTo;
  }

  return result.url;
}
