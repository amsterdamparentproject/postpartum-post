/**
 * Headline numbers for the public "Perks worth €X" copy (homepage stats row
 * and the /perks hero). Counts only LIVE ('published') perks: coming-soon
 * perks aren't redeemable yet, so they stay out of both the deal count and
 * the euro total until they launch ("and counting!").
 *
 * The euro value is the sum of each perk's estimated_savings, which is
 * Alex's own estimate, so the copy says "worth", never "save". A perk with no
 * estimate still counts as a deal but adds nothing to the total.
 */
export interface PerkSummaryInput {
  status: string;
  estimated_savings?: number | null;
}

export interface PerkSummary {
  /** Live perks */
  count: number;
  /** Whole euros: the sum of the live perks' estimated savings. */
  totalSavings: number;
}

export function summarizeLivePerks(perks: PerkSummaryInput[]): PerkSummary {
  const live = perks.filter((p) => p.status === "published");
  return {
    count: live.length,
    totalSavings: live.reduce((sum, p) => sum + (p.estimated_savings ?? 0), 0),
  };
}
