import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyConsentToken } from "@/lib/tokens";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("member_id");
  const token = searchParams.get("token");

  const secretPresent = !!process.env.SKIP_TOKEN_SECRET;
  const tokenValid = memberId && token ? verifyConsentToken(memberId, token) : false;
  console.error(`[consent/confirm] member_id=${memberId} token_prefix=${token?.slice(0, 8)} secret_present=${secretPresent} valid=${tokenValid}`);

  if (!memberId || !token || !tokenValid) {
    return NextResponse.redirect(`${SITE_URL}/consent/confirmed?invalid=1`);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await supabase
    .from("members")
    .update({
      guidelines_accepted_at: now,
      eligibility_confirmed_at: now,
    })
    .eq("id", memberId)
    .is("guidelines_accepted_at", null); // idempotent — only set if not already confirmed

  return NextResponse.redirect(`${SITE_URL}/consent/confirmed`);
}
