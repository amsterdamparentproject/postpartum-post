import { recordEntitlement } from "@/lib/match-ledger";
import type { createAdminClient } from "@/lib/supabase";
import type { CodeCohort } from "@/lib/cohort";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Puts an existing, active, cohort-less member into a cohort and grants the
 * cohort's free match(es) through the ledger. Shared by the billing-page code
 * box and the cohort splash page (when the email already belongs to a member).
 *
 * Claims the cohort only if the member still has none, so a double submit can't
 * grant twice. If the grant fails, the cohort tag is undone. Returns false when
 * the claim or the grant didn't go through.
 */
export async function joinCohortAsExistingMember(
  supabase: AdminClient,
  memberId: string,
  cohort: Pick<CodeCohort, "slug" | "grant_matches">,
): Promise<boolean> {
  const { data: claimed, error: claimError } = await supabase
    .from("members")
    .update({ cohort: cohort.slug, cohort_joined_at: new Date().toISOString() })
    .eq("id", memberId)
    .is("cohort", null)
    .eq("status", "active")
    .select("id");
  if (claimError || !claimed?.length) {
    if (claimError) console.error("[joinCohortAsExistingMember] claim failed:", claimError);
    return false;
  }
  try {
    if (cohort.grant_matches > 0) {
      await recordEntitlement(supabase, {
        memberId,
        event: "manual_grant",
        delta: cohort.grant_matches,
        note: `cohort:${cohort.slug}`,
      });
    }
  } catch (e) {
    console.error("[joinCohortAsExistingMember] grant failed, undoing the cohort tag:", e);
    await supabase.from("members").update({ cohort: null, cohort_joined_at: null }).eq("id", memberId);
    return false;
  }
  return true;
}
