import { createAdminClient } from "@/lib/supabase";

/** The live Post Perk a partner cohort's partner offers, for linking from the cohort's page. */
export type CohortPerk = {
  id: string;
  /** Short link name when the perk has one; the link falls back to the id. */
  slug: string | null;
  title: string;
  estimatedSavings: number | null;
};

/**
 * Finds the published, unexpired perk offered by the partner with this business
 * name (the perk lives in Post Perks like any other; nothing ties it to the
 * cohort except the partner's name). Null when there is none yet, or on any
 * lookup failure, so the page simply leaves the perk callout out.
 */
export async function getCohortPerk(partnerName: string): Promise<CohortPerk | null> {
  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("perks_partners")
      .select("id, slug, title, estimated_savings")
      .eq("partner_name", partnerName)
      .eq("status", "published")
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order("featured", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id as string,
      slug: (data.slug as string | null) ?? null,
      title: data.title as string,
      estimatedSavings: (data.estimated_savings as number | null) ?? null,
    };
  } catch (e) {
    console.error("[getCohortPerk] lookup failed:", e);
    return null;
  }
}
