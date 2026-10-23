import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { sendCohortContinueEmail } from "./emails/continue-cohort";
import { generateContinueToken } from "./tokens";
import { loadContinueOffer } from "./continue-offer-pricing";
import { summarizeLivePerks } from "./perk-summary";

/**
 * Sends the "keep going?" email to comped cohort members whose free match is
 * used. Shared by the monthly job (app/api/send-continue-offers/route.ts) and
 * the manual script (scripts/send-cohort-continue.mts), so the two always agree
 * on who is eligible.
 *
 * A member is eligible when ALL of these hold:
 *   - their cohort has a continue promotion code (cohorts.continue_promo_code_id)
 *   - billing_mode is comped_* and status is active
 *   - matches_remaining <= 0 (the free credit is spent, however it was spent:
 *     a delivered match, or no response to the round)
 *   - continue_offer_sent_at is null (never sent)
 *
 * Paying members who joined a cohort with a code (billing_mode subscription)
 * are NOT eligible: they already pay, and renew-check bills them at 0.
 *
 * Plain relative imports only, so the send script can load this file directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type ContinueCandidate = { id: string; email: string; first_name: string | null };

export type RecipientOutcome = "would_send" | "sent" | "failed" | "skipped_already_claimed";

export type CohortRunResult = {
  slug: string;
  status: "ok" | "offer_unavailable";
  /** Comped members at 0 who were never sent the offer. */
  eligible: number;
  sent: number;
  failed: number;
  members: { memberId: string; email: string; outcome: RecipientOutcome }[];
};

export type SendContinueOffersOptions = {
  stripe: Stripe;
  siteUrl: string;
  dryRun: boolean;
  /** Limit to one cohort slug. Default: every cohort that has an offer. */
  cohortSlug?: string;
  /** Limit to one member (lower-case email). */
  onlyEmail?: string | null;
};

/**
 * Whole euros: the estimated value of the live (published, not expired) Post
 * Perks, the same figure the homepage and /perks show. Null when it can't be
 * loaded or nothing is live, so the email just leaves the figure out and a
 * perks hiccup never blocks a send.
 */
async function loadPerksTotal(supabase: Db): Promise<number | null> {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }); // YYYY-MM-DD
    const { data, error } = await supabase
      .from("perks_partners")
      .select("status, estimated_savings, frequency")
      .eq("status", "published")
      .or(`expires_at.is.null,expires_at.gte.${today}`);
    if (error) {
      console.error("[continue-offers] loading the perks total failed:", error.message);
      return null;
    }
    const total = summarizeLivePerks((data ?? []) as Parameters<typeof summarizeLivePerks>[0]).totalSavings;
    return total > 0 ? total : null;
  } catch (e) {
    console.error("[continue-offers] loading the perks total failed:", e);
    return null;
  }
}

export async function sendContinueOffers(supabase: Db, opts: SendContinueOffersOptions): Promise<CohortRunResult[]> {
  let cohortQuery = supabase
    .from("cohorts")
    .select("slug, name, continue_promo_code_id")
    .not("continue_promo_code_id", "is", null);
  if (opts.cohortSlug) cohortQuery = cohortQuery.eq("slug", opts.cohortSlug);
  const { data: cohorts, error: cohortsError } = await cohortQuery;
  if (cohortsError) throw new Error(`Failed to load cohorts: ${cohortsError.message}`);

  const results: CohortRunResult[] = [];
  const perksTotal = cohorts?.length ? await loadPerksTotal(supabase) : null;

  for (const cohort of cohorts ?? []) {
    const result: CohortRunResult = {
      slug: cohort.slug,
      status: "ok",
      eligible: 0,
      sent: 0,
      failed: 0,
      members: [],
    };
    results.push(result);

    // The prices and discount come from Stripe, so a retired or misconfigured
    // promotion code stops the send for this cohort instead of emailing a
    // broken offer.
    let offer;
    try {
      offer = await loadContinueOffer(opts.stripe, cohort.continue_promo_code_id);
    } catch (e) {
      console.error("[continue-offers] loading the offer failed:", cohort.slug, e);
      offer = null;
    }
    if (!offer) {
      result.status = "offer_unavailable";
      continue;
    }

    let memberQuery = supabase
      .from("members")
      .select("id, email, first_name")
      .eq("cohort", cohort.slug)
      .in("billing_mode", ["comped_no_perks", "comped_with_perks"])
      .eq("status", "active")
      .lte("matches_remaining", 0)
      .is("continue_offer_sent_at", null);
    if (opts.onlyEmail) memberQuery = memberQuery.eq("email", opts.onlyEmail);
    const { data: candidates, error: membersError } = await memberQuery;
    if (membersError) throw new Error(`Failed to load members for ${cohort.slug}: ${membersError.message}`);
    const recipients = (candidates ?? []) as ContinueCandidate[];
    result.eligible = recipients.length;

    const link = (memberId: string, plan: string) =>
      `${opts.siteUrl}/api/continue?member_id=${memberId}&plan=${plan}&token=${generateContinueToken(memberId, plan)}`;

    for (const member of recipients) {
      if (opts.dryRun) {
        result.members.push({ memberId: member.id, email: member.email, outcome: "would_send" });
        continue;
      }

      // Claim first, then send: the update only matches while the marker is
      // still null, so a retried or concurrent run can't send a second email.
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
        await sendCohortContinueEmail(
          member.email,
          member.first_name ?? "there",
          cohort.name,
          link(member.id, "standard_monthly"),
          link(member.id, "commitment_3mo"),
          offer,
          perksTotal
        );
        result.sent++;
        result.members.push({ memberId: member.id, email: member.email, outcome: "sent" });
      } catch (e) {
        // Release the claim so the next run retries this member.
        await supabase.from("members").update({ continue_offer_sent_at: null }).eq("id", member.id);
        console.error("[continue-offers] send failed:", member.id, e instanceof Error ? e.message : String(e));
        result.failed++;
        result.members.push({ memberId: member.id, email: member.email, outcome: "failed" });
      }
    }
  }

  return results;
}
