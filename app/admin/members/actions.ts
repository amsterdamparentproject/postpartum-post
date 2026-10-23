"use server";

import { cookies } from "next/headers";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { createAdminClient } from "@/lib/supabase";
import { compMember, lookupCompTarget, type CompLookup, type CompReason } from "@/lib/comp-member";
import { sendGiftedWelcomeEmail, sendGiftedRoundsEmail } from "@/lib/emails";
import { createWelcomeSignIn } from "@/lib/member-welcome";
import { consentEntryLink } from "@/lib/emails/welcome-gifted";

export type CompMemberActionResult =
  | { ok: true; email: string; emailSent: boolean; includePerks: boolean; rounds: number }
  | { ok: true; existing: true; email: string; matchesRemaining: number; rounds: number; emailSent: boolean | null }
  | { error: string };

/** Read-only check behind the form's on-blur message. Admin only: it reveals whether an email is a member. */
export async function lookupCompTargetAction(email: string): Promise<CompLookup | { error: string }> {
  const cookieStore = await cookies();
  if (!verifyAdminSessionToken(cookieStore.get("admin_session")?.value)) {
    return { error: "Your admin session expired. Sign in again." };
  }
  return lookupCompTarget(createAdminClient(), email);
}

/**
 * Admin utility: gift a new person free rounds (with or without Post Perks) without
 * the gift card flow. See lib/comp-member.ts for what it creates.
 *
 * Server actions are public POST endpoints, so the admin session is checked
 * here, not just on the page that renders the form.
 */
export async function compMemberAction(input: { email: string; name?: string; includePerks: boolean; reason: CompReason; rounds?: number; note?: string; sendEmail?: boolean }): Promise<CompMemberActionResult> {
  const cookieStore = await cookies();
  if (!verifyAdminSessionToken(cookieStore.get("admin_session")?.value)) {
    return { error: "Your admin session expired. Sign in again." };
  }

  const supabase = createAdminClient();
  const result = await compMember(supabase, input);
  if ("error" in result) return result;
  const note = input.note?.trim().slice(0, 300) || null;

  if (result.existing) {
    // Existing members get a short "we added rounds" email unless it's switched off.
    // emailSent is null when no email was meant to go out.
    if (input.sendEmail === false) {
      return { ok: true, existing: true, email: result.email, matchesRemaining: result.matchesRemaining, rounds: result.rounds, emailSent: null };
    }
    let sent = false;
    try {
      const { signInLink } = await createWelcomeSignIn(supabase, result.email, { path: "/billing" });
      await sendGiftedRoundsEmail(result.email, {
        firstName: result.firstName,
        rounds: result.rounds,
        total: result.matchesRemaining,
        link: signInLink,
        note,
      });
      sent = true;
    } catch (e) {
      console.error("[comp-member] rounds email failed (non-fatal):", e);
    }
    return { ok: true, existing: true, email: result.email, matchesRemaining: result.matchesRemaining, rounds: result.rounds, emailSent: sent };
  }

  // The member and the round exist now; a failed email shouldn't undo them.
  let emailSent = false;
  try {
    await sendGiftedWelcomeEmail(result.email, consentEntryLink(result.memberId), result.includePerks, note, result.rounds);
    emailSent = true;
  } catch (e) {
    console.error("[comp-member] welcome email failed (non-fatal):", e);
  }

  return { ok: true, email: result.email, emailSent, includePerks: result.includePerks, rounds: result.rounds };
}
