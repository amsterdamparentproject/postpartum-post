/**
 * POST /api/send-optin-email
 *
 * Sends the monthly opt-in email to all active members.
 * Called by n8n on the 1st of each month.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Response:
 *   { sent: number, failed: number, errors: Array<{ email: string, error: string }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { generateOptinToken } from "@/lib/optin-token";
import { currentMonth } from "@/lib/tokens";
import { sendOptinEmail } from "@/lib/emails";
import { fetchBillingNoticeContext } from "@/lib/billing-notice";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
const TEST_EMAIL = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[send-optin-email] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------------
  let testMode = false;
  try {
    const body = await req.json();
    testMode = body?.testMode === true;
  } catch {
    // Empty body is fine
  }

  // -------------------------------------------------------------------------
  // Fetch recipients: every active member, plus "canceling" members who still
  // have a match left to use. A canceling member at matches_remaining <= 0 has
  // used up their term and is just waiting for renew-check (the 10th) to
  // finalize the cancellation — they can't opt in (the click is gated on the
  // counter), so the invitation would only confuse them.
  //
  // Active members at 0 deliberately still get the email (Track E3: the gate
  // is at the click, not the send).
  // -------------------------------------------------------------------------
  const supabase = createAdminClient();
  const { data: members, error } = await supabase
    .from("members")
    .select("id, first_name, email, matches_remaining")
    .or("status.eq.active,and(status.eq.canceling,matches_remaining.gt.0)");

  if (error) {
    console.error("[send-optin-email] Failed to fetch members:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }

  if (!members?.length) {
    return NextResponse.json({ sent: 0, failed: 0, errors: [], testMode });
  }

  // -------------------------------------------------------------------------
  // Send emails
  // In test mode, send only to the TEST_EMAIL account using that member's
  // own tokens so the links are valid and the email renders realistically.
  // -------------------------------------------------------------------------
  const month = currentMonth(); // YYYY-MM
  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  const targets = testMode ? members.filter(m => m.email === TEST_EMAIL) : members;

  for (const member of targets) {
    const buildUrl = (action: "coffee" | "playdate" | "perks" | "skip") => {
      const token = generateOptinToken(member.id, month, action);
      return `${SITE_URL}/api/optin?member=${member.id}&month=${month}&action=${action}&token=${token}`;
    };

    try {
      // Track E "Renewal timing" (billing-simplification-plan.md): the
      // soft half of the two-tier renewal notice — a bundle member with
      // exactly one match left going into this round may be about to hit
      // zero. Same isBundle && matchesRemaining === 1 condition
      // lib/member-status.ts already uses for its "Last match of your
      // bundle" state, surfaced a cycle earlier. A billing-notice Stripe
      // lookup failure here is non-fatal — the email still sends without
      // the soft notice rather than blocking the whole send.
      let lastMatchNotice = false;
      try {
        const context = await fetchBillingNoticeContext(supabase, member.id);
        const isBundle = (context?.intervalCount ?? 1) > 1;
        // A canceling member's bundle isn't going to renew, so "your bundle is
        // set to renew next month" would be wrong for them.
        lastMatchNotice = isBundle && member.matches_remaining === 1 && context?.memberStatus !== "canceling";
      } catch (e) {
        console.error(`[send-optin-email] billing-notice lookup failed for member ${member.id} (non-fatal):`, e);
      }

      await sendOptinEmail(
        member.email,
        member.first_name,
        buildUrl("coffee"),
        buildUrl("playdate"),
        buildUrl("perks"),
        buildUrl("skip"),
        lastMatchNotice
      );
      sent++;
    } catch (err) {
      failed++;
      errors.push({
        email: member.email,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[send-optin-email] Failed to send to member ${member.id}:`, err);
    }
  }

  return NextResponse.json({ sent, failed, errors, testMode });
}
