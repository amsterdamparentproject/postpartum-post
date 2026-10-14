import type { createAdminClient } from "@/lib/supabase";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";
import { isOptinWindowOpen } from "@/lib/optin-window";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Builds the signed sign-in link a welcome email points at: /matches while
 * the opt-in window is open (the button is "Opt into this round"), otherwise
 * /my-perks. One link only: a second generateLink for the same email would
 * replace the first's token. Falls back to the plain URL if link generation
 * fails, so the email still goes out.
 *
 * Shared by the Stripe checkout webhook and the comped cohort signup.
 */
export async function createWelcomeSignIn(
  supabase: AdminClient,
  email: string
): Promise<{ signInLink: string; windowOpen: boolean }> {
  const windowOpen = isOptinWindowOpen();
  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL}/${windowOpen ? "matches" : "my-perks"}`;
  const linkResult = await generateMagicLinkWithRetry(supabase, email, redirectTo);
  if (linkResult.success) {
    return { signInLink: linkResult.url, windowOpen };
  }
  console.error("[welcome] generateLink failed, falling back to plain URL:", linkResult.error);
  return { signInLink: redirectTo, windowOpen };
}
