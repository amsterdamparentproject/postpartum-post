"use server";

import { createAdminClient } from "@/lib/supabase";
import { recordEntitlement } from "@/lib/match-ledger";
import { createWelcomeSignIn } from "@/lib/member-welcome";
import { sendCohortWelcomeEmail } from "@/lib/emails";
import { COHORT_DSA } from "@/lib/cohort";

export type CohortSignupFormData = {
  firstName: string;
  lastName: string;
  email: string;
  code: string;
  eligibilityConfirmed: boolean;
  guidelinesAccepted: boolean;
};

export type CohortSignupResult = { ok: true } | { error: string };

const COHORT_NAME = "Dutch for Parents";

/**
 * Free, no-card signup for Dutch for Parents students.
 *
 * Creates an active member tagged cohort=dsa / billing_mode=comped_no_perks and grants
 * one match through the ledger (a manual_grant, +1). Nothing touches Stripe:
 * no customer, no subscription. renew-check already skips members without a
 * subscription row, and the matcher keeps comped members inside their cohort
 * (monthly_participation.cohort_only, forced true at opt-in).
 *
 * The code is one shared secret in DSA_SIGNUP_CODE (case-insensitive).
 */
export async function signupCohort(data: CohortSignupFormData): Promise<CohortSignupResult> {
  if (!data.eligibilityConfirmed || !data.guidelinesAccepted) {
    return { error: "Please confirm your eligibility and agree to the Community Guidelines." };
  }

  const expectedCode = process.env.DSA_SIGNUP_CODE?.trim();
  if (!expectedCode) {
    console.error("[signup-cohort] DSA_SIGNUP_CODE is not set");
    return { error: "Something went wrong. Please try again, or email us." };
  }
  if (data.code.trim().toLowerCase() !== expectedCode.toLowerCase()) {
    return { error: "That code doesn't look right. Check the code from Mariska and try again." };
  }

  const email = data.email.trim().toLowerCase();
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
      email,
      status: "active",
      cohort: COHORT_DSA,
      billing_mode: "comped_no_perks",
      eligibility_confirmed_at: now,
      guidelines_accepted_at: now,
    })
    .select("id")
    .single();

  if (error || !member) {
    if (error?.code === "23505") {
      return {
        error:
          "This email is already signed up for Postpartum Post. Sign in to your account instead, or email us if you need help.",
      };
    }
    console.error("[signup-cohort] member insert failed:", error);
    return { error: "Something went wrong. Please try again." };
  }

  try {
    await recordEntitlement(supabase, {
      memberId: member.id,
      event: "manual_grant",
      delta: 1,
      note: `cohort:${COHORT_DSA}`,
    });
  } catch (e) {
    console.error("[signup-cohort] grant failed, rolling back member:", e);
    await supabase.from("members").delete().eq("id", member.id);
    return { error: "Something went wrong. Please try again." };
  }

  try {
    const { signInLink } = await createWelcomeSignIn(supabase, email);
    await sendCohortWelcomeEmail(email, data.firstName.trim() || "there", signInLink, COHORT_NAME);
  } catch (e) {
    // Non-fatal: the member and grant exist; a failed email shouldn't undo them.
    console.error("[signup-cohort] welcome email failed (non-fatal):", e);
  }

  return { ok: true };
}
