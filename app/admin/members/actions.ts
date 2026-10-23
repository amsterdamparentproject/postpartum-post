"use server";

import { cookies } from "next/headers";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { createAdminClient } from "@/lib/supabase";
import { compMember, lookupCompTarget, type CompLookup } from "@/lib/comp-member";
import { createWelcomeSignIn } from "@/lib/member-welcome";
import { sendGiftedWelcomeEmail } from "@/lib/emails";

export type CompMemberActionResult =
  | { ok: true; email: string; emailSent: boolean; includePerks: boolean }
  | { ok: true; existing: true; email: string; matchesRemaining: number }
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
 * Admin utility: gift a new person a free round (with or without Post Perks) without
 * the gift card flow. See lib/comp-member.ts for what it creates.
 *
 * Server actions are public POST endpoints, so the admin session is checked
 * here, not just on the page that renders the form.
 */
export async function compMemberAction(input: { email: string; name?: string; includePerks: boolean; note?: string }): Promise<CompMemberActionResult> {
  const cookieStore = await cookies();
  if (!verifyAdminSessionToken(cookieStore.get("admin_session")?.value)) {
    return { error: "Your admin session expired. Sign in again." };
  }

  const supabase = createAdminClient();
  const result = await compMember(supabase, input);
  if ("error" in result) return result;
  if (result.existing) return result;

  // The member and the round exist now; a failed email shouldn't undo them.
  let emailSent = false;
  try {
    const { signInLink } = await createWelcomeSignIn(supabase, result.email, { path: "/profile" });
    await sendGiftedWelcomeEmail(result.email, signInLink, result.includePerks, input.note?.trim().slice(0, 300) || null);
    emailSent = true;
  } catch (e) {
    console.error("[comp-member] welcome email failed (non-fatal):", e);
  }

  return { ok: true, email: result.email, emailSent, includePerks: result.includePerks };
}
