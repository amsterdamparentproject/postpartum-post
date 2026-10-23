import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { sendGiftedContinueEmail } from "./emails/continue-gifted";
import { generateContinueToken } from "./tokens";
import { loadRegularContinuePlans } from "./continue-offer-pricing";
import type { CohortRunResult, SendContinueOffersOptions } from "./continue-offer-send";

/**
 * Sends the regular-price "keep going?" email to comped members who have no
 * cohort offer: no cohort (e.g. a gifted membership), or a cohort with no
 * continue promotion code. They must be active, with their free round used
 * (matches_remaining <= 0) and never sent this email (continue_offer_sent_at is
 * null). The checkout links charge the regular price; members of a cohort WITH
 * a code get its discounted email instead (lib/continue-offer-send.ts).
 *
 * Same claim-then-send guard as the cohort job, and the same marker column, so
 * nobody is emailed twice. Runs alongside it in the monthly job and the manual
 * script. Plain relative imports only, so the send script can load this file.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** How this run is labeled in the job output and script. */
export const GIFTED_SLUG = "regular-price";

export async function sendGiftedContinueOffers(
  supabase: Db,
  opts: Pick<SendContinueOffersOptions, "stripe" | "siteUrl" | "dryRun" | "onlyEmail">
): Promise<CohortRunResult[]> {
  const result: CohortRunResult = { slug: GIFTED_SLUG, status: "ok", eligible: 0, sent: 0, failed: 0, members: [] };

  let offer;
  try {
    offer = await loadRegularContinuePlans(opts.stripe as Stripe);
  } catch (e) {
    console.error("[gifted-continue] loading the regular prices failed:", e);
    offer = null;
  }

  // Cohorts with no continue code: their members get the regular-price email too.
  const { data: noOfferCohorts, error: cohortsError } = await supabase
    .from("cohorts")
    .select("slug")
    .is("continue_promo_code_id", null);
  if (cohortsError) throw new Error(`Failed to load cohorts: ${cohortsError.message}`);
  const noOfferSlugs = (noOfferCohorts ?? []).map((c: { slug: string }) => c.slug);

  let memberQuery = supabase
    .from("members")
    .select("id, email, first_name, billing_mode")
    .or(noOfferSlugs.length ? `cohort.is.null,cohort.in.(${noOfferSlugs.join(",")})` : "cohort.is.null")
    .in("billing_mode", ["comped_no_perks", "comped_with_perks"])
    .eq("status", "active")
    .lte("matches_remaining", 0)
    .is("continue_offer_sent_at", null);
  if (opts.onlyEmail) memberQuery = memberQuery.eq("email", opts.onlyEmail);
  const { data: candidates, error: membersError } = await memberQuery;
  if (membersError) throw new Error(`Failed to load gifted members: ${membersError.message}`);
  const recipients = (candidates ?? []) as { id: string; email: string; first_name: string | null; billing_mode: string }[];
  result.eligible = recipients.length;

  // Prices come from Stripe: if they can't be loaded, send nothing rather than a broken email.
  if (!offer) {
    if (recipients.length) result.status = "offer_unavailable";
    return recipients.length ? [result] : [];
  }
  if (!recipients.length) return [];

  const link = (memberId: string, plan: string) =>
    `${opts.siteUrl}/api/continue?member_id=${memberId}&plan=${plan}&token=${generateContinueToken(memberId, plan)}`;

  for (const member of recipients) {
    if (opts.dryRun) {
      result.members.push({ memberId: member.id, email: member.email, outcome: "would_send" });
      continue;
    }

    const { data: claimed, error: claimError } = await supabase
      .from("members")
      .update({ continue_offer_sent_at: new Date().toISOString() })
      .eq("id", member.id)
      .is("continue_offer_sent_at", null)
      .select("id");
    if (claimError) throw new Error(`Failed to claim ${member.id}: ${claimError.message}`);
    if (!claimed?.length) {
      result.members.push({ memberId: member.id, email: member.email, outcome: "skipped_already_claimed" });
      continue;
    }

    try {
      await sendGiftedContinueEmail(
        member.email,
        member.first_name ?? "",
        link(member.id, "standard_monthly"),
        link(member.id, "commitment_3mo"),
        offer,
        member.billing_mode === "comped_with_perks"
      );
      result.sent++;
      result.members.push({ memberId: member.id, email: member.email, outcome: "sent" });
    } catch (e) {
      await supabase.from("members").update({ continue_offer_sent_at: null }).eq("id", member.id);
      console.error("[gifted-continue] send failed:", member.id, e instanceof Error ? e.message : String(e));
      result.failed++;
      result.members.push({ memberId: member.id, email: member.email, outcome: "failed" });
    }
  }

  return [result];
}
