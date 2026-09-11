/**
 * Shared "magic link to /feedback" helper — originally written for the
 * meetup reminder (lib/meetup-reminder.ts), now also used by the
 * unsubscribed email so a just-canceled member can leave feedback in one
 * click without needing to log back in first.
 */

import { createAdminClient } from "@/lib/supabase";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
export const FEEDBACK_URL = `${SITE_URL}/feedback`;
const FEEDBACK_CONFIRM_URL = `${SITE_URL}/auth/confirm?next=${encodeURIComponent("/feedback")}`;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Magic link through /auth/confirm?next=/feedback; falls back to a plain
 * /feedback link (no auto sign-in) if generation fails.
 *
 * Built from hashed_token + type ourselves (postpartumpost.com/auth/confirm),
 * rather than using the returned action_link directly — action_link points
 * at <project-ref>.supabase.co/auth/v1/verify first, which is a working
 * link but shows the raw Supabase project URL in the email before it
 * redirects. Same reasoning as verifyMagicLinkToken's docblock in
 * lib/auth-confirm.ts, applied here for the admin.generateLink caller too.
 */
export async function feedbackMagicLink(supabase: AdminClient, email: string, memberId: string): Promise<string> {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: FEEDBACK_CONFIRM_URL },
    });
    const hashedToken = data?.properties?.hashed_token;
    if (!error && hashedToken) {
      const next = encodeURIComponent("/feedback");
      return `${SITE_URL}/auth/confirm?token_hash=${hashedToken}&type=magiclink&next=${next}`;
    }
  } catch (err) {
    console.error("[feedback-link] generateLink failed for member", memberId, err);
  }
  return FEEDBACK_URL;
}
