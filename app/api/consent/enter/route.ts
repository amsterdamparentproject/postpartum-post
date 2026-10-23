import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyConsentToken } from "@/lib/tokens";
import { createWelcomeSignIn } from "@/lib/member-welcome";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

/**
 * GET /api/consent/enter?member_id=…&token=…
 *
 * The "Go to your profile" button in the gifted welcome email
 * (lib/emails/welcome-gifted.ts). The email says that clicking it means the
 * person agrees to the Community Guidelines and confirms they're eligible, so
 * this stamps both consent timestamps (as /api/consent/confirm does), then
 * signs them in and sends them to /profile.
 *
 * The sign-in link is generated here, at click time, rather than put in the
 * email: a magic link baked into an email expires (Supabase's OTP setting)
 * and is single-use, while this link only needs the member to click it.
 *
 * The token is the same HMAC as the consent link (verifyConsentToken), tied
 * to the member id. Idempotent: consent is only stamped the first time.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("member_id");
  const token = searchParams.get("token");

  if (!memberId || !token || !verifyConsentToken(memberId, token)) {
    return NextResponse.redirect(`${SITE_URL}/consent/confirmed?invalid=1`);
  }

  const supabase = createAdminClient();
  const { data: member } = await supabase.from("members").select("email").eq("id", memberId).maybeSingle();
  if (!member?.email) {
    return NextResponse.redirect(`${SITE_URL}/consent/confirmed?invalid=1`);
  }

  const now = new Date().toISOString();
  await supabase
    .from("members")
    .update({ guidelines_accepted_at: now, eligibility_confirmed_at: now })
    .eq("id", memberId)
    .is("guidelines_accepted_at", null);

  // Falls back to the plain /profile URL (which asks them to sign in) if the link can't be made.
  const { signInLink } = await createWelcomeSignIn(supabase, member.email, { path: "/profile" });
  return NextResponse.redirect(signInLink);
}
