"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";

export type ResumeMembershipResult =
  | { ok: true }
  | { ok: false; reason: "not_authenticated" | "not_canceling" | "no_live_subscription" | "failed" };

/**
 * "I changed my mind" for a member who canceled: puts them back to "active".
 *
 * Database only, no Stripe call. Cancel (unsubscribe.ts) only paused
 * collection, which is exactly the resting state every active member's
 * subscription is in between renewals, and the counter is untouched. So
 * flipping the status back is all it takes: renew-check bills them when the
 * counter reaches zero, as it does for any active member.
 *
 * Needs a live (non-canceled) subscription to resume into. Without one (it
 * was deleted, or renew-check already canceled it) there is nothing to
 * resume, and the member has to rejoin through checkout instead. Resuming
 * into a second subscription would double-bill them.
 *
 * Safe to call twice.
 */
export async function resumeMembership(accessToken: string): Promise<ResumeMembershipResult> {
  // Identity comes from the verified session, never a client-supplied id.
  const authed = await requireMember(accessToken);
  if (!authed) return { ok: false, reason: "not_authenticated" };
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  try {
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    if (memberError || !member) throw new Error(`member lookup failed: ${memberError?.message}`);

    // Already back (double click): nothing to do.
    if (member.status === "active") return { ok: true };
    if (member.status !== "canceling") return { ok: false, reason: "not_canceling" };

    const { data: liveSub, error: subError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("member_id", memberId)
      .neq("status", "canceled")
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(`subscription lookup failed: ${subError.message}`);
    if (!liveSub) return { ok: false, reason: "no_live_subscription" };

    // Guarded on still being "canceling" so a concurrent change (renew-check
    // finalizing them, the deletion webhook) isn't overwritten.
    const { error: updateError } = await supabase
      .from("members")
      .update({ status: "active", canceled_at: null })
      .eq("id", memberId)
      .eq("status", "canceling");
    if (updateError) throw new Error(`setting active failed: ${updateError.message}`);

    return { ok: true };
  } catch (e) {
    console.error("[resumeMembership] failed:", e);
    return { ok: false, reason: "failed" };
  }
}
