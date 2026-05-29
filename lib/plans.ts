export type PlanValue = "first20_3mo" | "commitment_3mo" | "standard_monthly";

export interface Plan {
  value: PlanValue;
  icon: string;
  price: string;
  name: string;
  billing: string;
  description?: string;
  badge?: string;
  featured?: boolean;
  comingSoon?: boolean;
  hidden?: boolean;
}

export const PLANS: Plan[] = [
  {
    value: "first20_3mo",
    icon: "🎉",
    price: "€5/mo",
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
    price: "€8/mo",
    name: "3-month commitment",
    billing: "Billed €24 every 3 months",
    description:
      "Commit to 3 matches and you get the 3rd one free!",
  },
  {
    value: "standard_monthly",
    icon: "📅",
    price: "€12/mo",
    name: "Monthly",
    billing: "Billed monthly",
  },
];

const FIRST20_END_DATE = new Date("2026-07-01");

export function resolvePlans(
  plans: Plan[],
  pilotOnly: boolean,
  first20SoldOut = false
): Plan[] {
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
