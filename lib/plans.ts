export type PlanValue = "first20_6mo" | "commitment_6mo" | "standard_monthly";

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
    value: "first20_6mo",
    icon: "🎉",
    price: "€5/mo",
    name: "First 20: Our founding members",
    billing: "Billed €30 every 6 months",
    description:
      "A special forever price for our earliest subscribers — €5/mo for as long as you're with us.",
    badge: "Until 1 July",
    featured: true,
  },
  {
    value: "commitment_6mo",
    icon: "⭐",
    price: "€8/mo",
    name: "6-month commitment",
    billing: "Billed €48 every 6 months",
    badge: "Best value",
  },
  {
    value: "standard_monthly",
    icon: "📅",
    price: "€12/mo",
    name: "Monthly",
    billing: "Billed monthly",
  },
];

export function resolvePlans(plans: Plan[], pilotOnly: boolean): Plan[] {
  return plans.map((plan) => ({
    ...plan,
    hidden: plan.value === "first20_6mo" ? !pilotOnly : false,
    comingSoon:
      (plan.value === "commitment_6mo" || plan.value === "standard_monthly") &&
      pilotOnly,
  }));
}

export function defaultPlan(pilotOnly: boolean): PlanValue {
  return pilotOnly ? "first20_6mo" : "commitment_6mo";
}
