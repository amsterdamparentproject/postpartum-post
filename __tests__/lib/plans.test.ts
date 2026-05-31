import { describe, it, expect, vi, afterEach } from "vitest";
import { PLANS, resolvePlans, defaultPlan } from "@/lib/plans";

describe("resolvePlans — pilot mode (PILOT_ONLY = true)", () => {
  const plans = resolvePlans(PLANS, true);

  it("shows FIRST20 plan", () => {
    const first20 = plans.find((p) => p.value === "first20_3mo");
    expect(first20?.hidden).toBe(false);
  });

  it("shows the 3-month commitment plan as coming soon", () => {
    const commitment = plans.find((p) => p.value === "commitment_3mo");
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
    const first20 = plans.find((p) => p.value === "first20_3mo");
    expect(first20?.hidden).toBe(true);
  });

  it("shows the 3-month commitment plan", () => {
    const commitment = plans.find((p) => p.value === "commitment_3mo");
    expect(commitment?.hidden).toBe(false);
  });

  it("shows the monthly plan and does not mark it coming soon", () => {
    const monthly = plans.find((p) => p.value === "standard_monthly");
    expect(monthly?.hidden).toBe(false);
    expect(monthly?.comingSoon).toBe(false);
  });
});

describe("resolvePlans — FIRST20 sold out before July 1", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps FIRST20 visible (as sold out) and releases other plans", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15"));

    const plans = resolvePlans(PLANS, false, true);

    const first20 = plans.find((p) => p.value === "first20_3mo");
    expect(first20?.hidden).toBe(false);

    const commitment = plans.find((p) => p.value === "commitment_3mo");
    expect(commitment?.hidden).toBe(false);
    expect(commitment?.comingSoon).toBe(false);

    const monthly = plans.find((p) => p.value === "standard_monthly");
    expect(monthly?.hidden).toBe(false);
    expect(monthly?.comingSoon).toBe(false);
  });
});

describe("resolvePlans — FIRST20 sold out after July 1", () => {
  afterEach(() => vi.useRealTimers());

  it("hides FIRST20 and shows other plans normally", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02"));

    const plans = resolvePlans(PLANS, false, true);

    const first20 = plans.find((p) => p.value === "first20_3mo");
    expect(first20?.hidden).toBe(true);

    const commitment = plans.find((p) => p.value === "commitment_3mo");
    expect(commitment?.hidden).toBe(false);
    expect(commitment?.comingSoon).toBe(false);

    const monthly = plans.find((p) => p.value === "standard_monthly");
    expect(monthly?.hidden).toBe(false);
    expect(monthly?.comingSoon).toBe(false);
  });
});

describe("defaultPlan", () => {
  it("defaults to first20_3mo in pilot mode", () => {
    expect(defaultPlan(true)).toBe("first20_3mo");
  });

  it("defaults to commitment_3mo in general mode", () => {
    expect(defaultPlan(false)).toBe("commitment_3mo");
  });
});
