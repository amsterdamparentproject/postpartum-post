import { describe, it, expect } from "vitest";
import { PLANS, resolvePlans, defaultPlan } from "@/lib/plans";

describe("resolvePlans — pilot mode (PILOT_ONLY = true)", () => {
  const plans = resolvePlans(PLANS, true);

  it("shows FIRST20 plan", () => {
    const first20 = plans.find((p) => p.value === "first20_6mo");
    expect(first20?.hidden).toBe(false);
  });

  it("shows the 6-month commitment plan as coming soon", () => {
    const commitment = plans.find((p) => p.value === "commitment_6mo");
    expect(commitment?.hidden).toBe(false);
    expect(commitment?.comingSoon).toBe(true);
  });

  it("marks the monthly plan as coming soon", () => {
    const monthly = plans.find((p) => p.value === "standard_monthly");
    expect(monthly?.comingSoon).toBe(true);
    expect(monthly?.hidden).toBe(false);
  });
});

describe("resolvePlans — general mode (PILOT_ONLY = false)", () => {
  const plans = resolvePlans(PLANS, false);

  it("hides the FIRST20 plan", () => {
    const first20 = plans.find((p) => p.value === "first20_6mo");
    expect(first20?.hidden).toBe(true);
  });

  it("shows the 6-month commitment plan", () => {
    const commitment = plans.find((p) => p.value === "commitment_6mo");
    expect(commitment?.hidden).toBe(false);
  });

  it("shows the monthly plan and does not mark it coming soon", () => {
    const monthly = plans.find((p) => p.value === "standard_monthly");
    expect(monthly?.hidden).toBe(false);
    expect(monthly?.comingSoon).toBe(false);
  });
});

describe("defaultPlan", () => {
  it("defaults to first20_6mo in pilot mode", () => {
    expect(defaultPlan(true)).toBe("first20_6mo");
  });

  it("defaults to commitment_6mo in general mode", () => {
    expect(defaultPlan(false)).toBe("commitment_6mo");
  });
});
