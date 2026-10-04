export type PlanValue = "first20_3mo" | "commitment_3mo" | "standard_monthly";

export interface Plan {
  value: PlanValue;
  icon: string;
  price: string;
  /** The price as a line item, e.g. "€8 a round (€24 for 3 rounds)". */
  priceLine?: string;
  name: string;
  billing: string;
  /** Billing line for a gifted plan (the rounds themselves are prepaid). */
  afterGift?: string;
  description?: string;
  badge?: string;
  featured?: boolean;
  comingSoon?: boolean;
  hidden?: boolean;
}

/**
 * The "what you get" lines on the plan cards. The perks line quotes the live
 * monthly total (what renews every round) as a floor, hence the "+"; without
 * a figure it falls back to a plain line.
 */
export function planIncludes(monthlyPerksValue?: number | null): string[] {
  return [
    "💌 A hand-picked match each round",
    monthlyPerksValue && monthlyPerksValue > 0
      ? `🎁 Post Perks worth €${monthlyPerksValue}+ every round`
      : "🎁 Post Perks from local businesses",
  ];
}

export const PLANS: Plan[] = [
  {
    value: "first20_3mo",
    icon: "🎉",
    price: "€5/mo",
    priceLine: "💶 €5/mo, for as long as you're with us",
    name: "First 20: Our founding members",
    billing: "Billed €15 every 3 months",
    description:
      "A special forever price for our earliest subscribers — €5/mo for as long as you're with us.",
    badge: "Until 1 July",
    featured: true,
  },
  {
    value: "commitment_3mo",
    icon: "⭐",
    price: "€8 per round",
    priceLine: "💶 €24 for 3 rounds",
    name: "3-round bundle (€8 per round)",
    billing: "€24 for 3 rounds, then renews. Cancel anytime.",
    afterGift: "Your gifted rounds are free. After that: €24 for 3 rounds, then renews. Cancel anytime.",
    badge: "3rd round free",
  },
  {
    value: "standard_monthly",
    icon: "📅",
    price: "€12 per round",
    priceLine: "💶 €12 for 1 round",
    name: "Round by round (€12 per round)",
    billing: "€12 for 1 round, then renews. Cancel anytime.",
    afterGift: "Your gifted round is free. After that: €12 for 1 round, then renews. Cancel anytime.",
  },
];

const FIRST20_END_DATE = new Date("2026-07-01");

/**
 * The founding-member pilot is over after FIRST20_END_DATE: the pilot flag is
 * ignored from then on, so FIRST20 never shows (e.g. on a local dev DB that
 * still has spots left) and the other plans are never "coming soon".
 */
export function effectivePilotOnly(pilotOnly: boolean): boolean {
  return pilotOnly && new Date() < FIRST20_END_DATE;
}

export function resolvePlans(
  plans: Plan[],
  pilotOnly: boolean,
  first20SoldOut = false
): Plan[] {
  pilotOnly = effectivePilotOnly(pilotOnly);
  const showSoldOutFirst20 = first20SoldOut && new Date() < FIRST20_END_DATE;
  return plans.map((plan) => ({
    ...plan,
    // Hide FIRST20 only when pilot is off AND we're not showing the sold-out block
    hidden:
      plan.value === "first20_3mo" ? !pilotOnly && !showSoldOutFirst20 : false,
    comingSoon:
      (plan.value === "commitment_3mo" || plan.value === "standard_monthly") &&
      pilotOnly,
  }));
}

export function defaultPlan(pilotOnly: boolean): PlanValue {
  return pilotOnly ? "first20_3mo" : "commitment_3mo";
}
