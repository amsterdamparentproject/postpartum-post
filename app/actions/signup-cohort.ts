"use server";

import { createAdminClient } from "@/lib/supabase";
import { recordEntitlement } from "@/lib/match-ledger";
import { createWelcomeSignIn } from "@/lib/member-welcome";
import { sendCohortWelcomeEmail } from "@/lib/emails";

export type CohortSignupFormData = {
  /** Which cohort to join, e.g. "dsa" (cohorts.slug). */
  cohort: string;
  firstName: string;
  lastName: string;
  email: string;
  code: string;
  eligibilityConfirmed: boolean;
  guidelinesAccepted: boolean;
};

export type CohortSignupResult = { ok: true } | { error: string };

/**
 * Free, no-card signup for a partner cohort (first: Dutch Speaking Academy, "dsa").
 *
 * Reads the cohort's settings from the cohorts table: the shared signup code
 * (case-insensitive, never sent to the browser), the signup cap, and how many
 * matches to grant. Creates an active member tagged cohort=<slug> /
 * billing_mode=comped_no_perks and grants the matches through the ledger (a
 * manual_grant). Nothing touches Stripe: no customer, no subscription.
 * renew-check already skips members without a subscription row, and the matcher
 * keeps comped members inside their cohort when the cohort restricts them
 * (monthly_participation.cohort_only, forced at opt-in).
 *
 * The cap is checked with a count before the insert, so two simultaneous
 * signups for the last place can overshoot by one. Fine at this scale.
 */
export async function signupCohort(data: CohortSignupFormData): Promise<CohortSignupResult> {
  if (!data.eligibilityConfirmed || !data.guidelinesAccepted) {
    return { error: "Please confirm your eligibility and agree to the Community Guidelines." };
  }

  const supabase = createAdminClient();
  const slug = data.cohort.trim().toLowerCase();

  const { data: cohort, error: cohortError } = await supabase
    .from("cohorts")
    .select("slug, name, signup_code, signup_cap, grant_matches, active")
    .eq("slug", slug)
    .maybeSingle();
  if (cohortError) {
    console.error("[signup-cohort] cohort lookup failed:", cohortError);
    return { error: "Something went wrong. Please try again, or email us." };
  }
  // Unknown, inactive, or no code set yet: signup is closed. Same message for
  // all three so the form doesn't reveal which cohorts exist.
  if (!cohort || !cohort.active || !cohort.signup_code) {
    return { error: "Signup isn't open right now. Please email us if you think this is a mistake." };
  }
  if (data.code.trim().toLowerCase() !== cohort.signup_code) {
    return { error: "That code doesn't look right. Check the code you were given and try again." };
  }

  if (cohort.signup_cap !== null) {
    const { count, error: countError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("cohort", slug);
    if (countError || count === null) {
      console.error("[signup-cohort] cap check failed:", countError);
      return { error: "Something went wrong. Please try again, or email us." };
    }
    if (count >= cohort.signup_cap) {
      return { error: "Sorry, all the places for this cohort are taken. Please email us and we'll help." };
    }
  }

  const email = data.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
      email,
      status: "active",
      cohort: slug,
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
    if (cohort.grant_matches > 0) {
      await recordEntitlement(supabase, {
        memberId: member.id,
        event: "manual_grant",
        delta: cohort.grant_matches,
        note: `cohort:${slug}`,
      });
    }
  } catch (e) {
    console.error("[signup-cohort] grant failed, rolling back member:", e);
    await supabase.from("members").delete().eq("id", member.id);
    return { error: "Something went wrong. Please try again." };
  }

  try {
    const { signInLink } = await createWelcomeSignIn(supabase, email);
    await sendCohortWelcomeEmail(email, data.firstName.trim() || "there", signInLink, cohort.name);
  } catch (e) {
    // Non-fatal: the member and grant exist; a failed email shouldn't undo them.
    console.error("[signup-cohort] welcome email failed (non-fatal):", e);
  }

  return { ok: true };
}
