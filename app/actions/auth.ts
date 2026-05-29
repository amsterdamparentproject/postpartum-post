"use server";

import { createAdminClient } from "@/lib/supabase";

/**
 * Generate a Supabase magic link for the given email.
 * Used after onboarding to sign the new member in without requiring them
 * to check their inbox first.
 */
export async function generateMagicLink(email: string): Promise<string> {
  const supabase = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL}/profile`;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error || !data.properties?.action_link) {
    console.error("[generateMagicLink] failed:", error?.message);
    // Fall back to plain profile URL — they can sign in from there
    return redirectTo;
  }

  return data.properties.action_link;
}
