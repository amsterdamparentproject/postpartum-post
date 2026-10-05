/**
 * How a member is billed (members.billing_mode, migration 033).
 *
 * - comped_no_perks    free match(es), no Stripe objects, no Post Perks
 *                      (e.g. the Dutch for Parents cohort's free month)
 * - comped_with_perks  free match(es), no Stripe objects, Post Perks included
 *                      (e.g. gifted memberships, FYP-style comps)
 * - subscription       a Stripe subscription, charged by renew-check
 * - invoiced           one-time invoices (the planned cutover)
 */
export type BillingMode = "comped_no_perks" | "comped_with_perks" | "subscription" | "invoiced";

export function isComped(mode: string | null | undefined): boolean {
  return mode === "comped_no_perks" || mode === "comped_with_perks";
}

/** Post Perks access follows the billing mode: only comped_no_perks is excluded. */
export function hasPerksAccess(mode: string | null | undefined): boolean {
  return mode !== "comped_no_perks";
}
