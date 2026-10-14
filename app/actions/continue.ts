"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { createContinueCheckoutUrl, getContinueOfferForMember, isContinuePlan } from "@/lib/continue-offer";
import type { ContinueOfferDetails } from "@/lib/continue-offer-pricing";

/**
 * Billing-page "Continue" buttons for a comped cohort member. Identity comes
 * from the verified session. Redirects to Stripe Checkout, or throws if the
 * member can't continue (the buttons only show when they can).
 */
export async function startContinueCheckout(accessToken: string, plan: string): Promise<never> {
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not authenticated");
  if (!isContinuePlan(plan)) throw new Error("Unknown plan");

  const result = await createContinueCheckoutUrl(createAdminClient(), authed.memberId, plan);
  if ("error" in result) throw new Error(`Continue offer unavailable: ${result.error}`);
  redirect(result.url);
}

/** The prices and discount for the billing-page buttons, or null when there's no offer for this member. */
export async function getContinueOfferDetails(accessToken: string): Promise<ContinueOfferDetails | null> {
  const authed = await requireMember(accessToken);
  if (!authed) return null;
  return getContinueOfferForMember(createAdminClient(), authed.memberId);
}
