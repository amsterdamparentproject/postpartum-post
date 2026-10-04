import { describe, it, expect } from "vitest";
import { summarizeLivePerks } from "@/lib/perk-summary";

describe("summarizeLivePerks", () => {
  it("counts and sums only live (published) perks", () => {
    expect(
      summarizeLivePerks([
        { status: "published", estimated_savings: 3 },
        { status: "published", estimated_savings: 9 },
        { status: "coming_soon", estimated_savings: 50 },
      ])
    ).toEqual({ count: 2, totalSavings: 12, monthlySavings: 0 });
  });

  it("counts a live perk with no estimate as a deal worth nothing", () => {
    expect(
      summarizeLivePerks([
        { status: "published", estimated_savings: null },
        { status: "published", estimated_savings: 6 },
      ])
    ).toEqual({ count: 2, totalSavings: 6, monthlySavings: 0 });
  });

  it("is zero when nothing is live", () => {
    expect(summarizeLivePerks([])).toEqual({ count: 0, totalSavings: 0, monthlySavings: 0 });
    expect(summarizeLivePerks([{ status: "coming_soon", estimated_savings: 5 }])).toEqual({
      count: 0,
      totalSavings: 0,
      monthlySavings: 0,
    });
  });

  it("sums only live monthly perks into monthlySavings (the per-round figure)", () => {
    expect(
      summarizeLivePerks([
        { status: "published", frequency: "monthly", estimated_savings: 9 },
        { status: "published", frequency: "monthly", estimated_savings: 3 },
        { status: "published", frequency: "once", estimated_savings: 6 },
        { status: "coming_soon", frequency: "monthly", estimated_savings: 50 },
      ])
    ).toEqual({ count: 3, totalSavings: 18, monthlySavings: 12 });
  });
});
