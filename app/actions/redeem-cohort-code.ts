"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { isComped } from "@/lib/billing-mode";
import { createWelcomeSignIn } from "@/lib/member-welcome";
import { sendCohortExistingMemberEmail } from "@/lib/emails";
import { findCohortByCode, cohortIsFull } from "@/lib/cohort";
import { joinCohortAsExistingMember } from "@/lib/cohort-join";
import { logError } from "@/lib/log-error";

export type RedeemCohortCodeResult =
  | { ok: true; cohortName: string; matchesGranted: number }
  | { error: string };

/**
 * An existing, paying member joins a partner cohort with its code and gets the
 * cohort's free match(es) (a manual_grant on the ledger, plan-blind, no Stripe).
 *
 * They stay on their own plan (not comped), so nothing about their billing or
 * Perks changes. The cohort tag is what counts them in the partner's headcount
 * and offers the optional "match me only with someone from <cohort>" checkbox.
 *
 * Identity comes from the verified session, never from a client-supplied id.
 * One cohort per member; a member who already has one can't redeem again.
 */
export async function redeemCohortCode(accessToken: string, code: string): Promise<RedeemCohortCodeResult> {
  const authed = await requireMember(accessToken);
  if (!authed) return { error: "Please sign in again and retry." };

  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, email, status, billing_mode, cohort")
    .eq("id", authed.memberId)
    .maybeSingle();
  if (!member || member.status !== "active" || isComped(member.billing_mode)) {
    return { error: "Codes can only be added to an active paid membership. Email us if you need help." };
  }
  if (member.cohort) {
    return { error: "You've already joined a partner program, so there's nothing more to add. Email us if that's a mistake." };
  }

  let cohort;
  try {
    cohort = await findCohortByCode(supabase, code);
  } catch (e) {
    console.error("[redeem-cohort-code] lookup failed:", e);
    await logError("signup.redeem.lookup_failed", e, { memberId: member.id });
    return { error: "Something went wrong. Please try again, or email us." };
  }
  if (!cohort) {
    return { error: "That code doesn't look right. Check the code you were given and try again." };
  }

  try {
    if (await cohortIsFull(supabase, cohort)) {
      return { error: "Sorry, all the places for this program are taken. Please email us and we'll help." };
    }
  } catch (e) {
    console.error("[redeem-cohort-code] cap check failed:", e);
    await logError("signup.redeem.cap_check_failed", e, { memberId: member.id });
    return { error: "Something went wrong. Please try again, or email us." };
  }

  if (!(await joinCohortAsExistingMember(supabase, member.id, cohort))) {
    await logError("signup.redeem.join_failed", new Error("joinCohortAsExistingMember returned false"), { memberId: member.id });
    return { error: "Something went wrong. Please try again, or email us." };
  }

  try {
    const { signInLink } = await createWelcomeSignIn(supabase, member.email);
    await sendCohortExistingMemberEmail(member.email, signInLink, cohort.name);
  } catch (e) {
    console.error("[redeem-cohort-code] confirmation email failed (non-fatal):", e);
    await logError("signup.redeem.confirmation_email_failed", e, { memberId: member.id });
  }

  return { ok: true, cohortName: cohort.name, matchesGranted: cohort.grant_matches };
}
