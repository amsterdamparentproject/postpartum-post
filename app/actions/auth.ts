"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";
import { getBaseUrl } from "@/lib/base-url";

/**
 * Generate a Supabase magic link that signs a brand-new member into their own
 * profile immediately after checkout, without an email round-trip.
 *
 * SECURITY (audit S1, PP twin): the email is NOT accepted from the client.
 * Returning a working sign-in link for a caller-supplied address would let
 * anyone mint one for any account = takeover. Instead we take the Stripe
 * Checkout Session id — unguessable, and present only in the person's own
 * `/success?session_id=...` return URL — verify it with Stripe, require the
 * session to be paid/complete, and derive the email from that session's
 * member. Only someone who actually completed that checkout holds the id, so
 * a link can only ever be minted for their own account. Any failure falls
 * back to the plain profile URL (they can sign in from there).
 */
export async function getOnboardingSignInLink(sessionId: string): Promise<string> {
  const redirectTo = `${await getBaseUrl()}/profile`;
  const supabase = createAdminClient();

  let email: string | undefined;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    // Only a completed/paid checkout proves ownership of the email. `status`
    // covers subscription-mode (complete); `payment_status` covers one-time.
    const verified =
      session.status === "complete" || session.payment_status === "paid";
    const memberId = session.metadata?.member_id;
    if (verified && memberId) {
      const { data: member } = await supabase
        .from("members")
        .select("email")
        .eq("id", memberId)
        .single();
      email = member?.email?.toLowerCase();
    }
  } catch (e) {
    console.error("[getOnboardingSignInLink] session verification failed:", e);
  }

  if (!email) {
    // Couldn't verify the checkout session — don't mint a link.
    return redirectTo;
  }

  const result = await generateMagicLinkWithRetry(supabase, email, redirectTo);
  if (!result.success) {
    console.error("[getOnboardingSignInLink] failed:", result.error);
    // Fall back to plain profile URL — they can sign in from there
    return redirectTo;
  }

  return result.url;
}
