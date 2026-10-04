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
    ).toEqual({ count: 2, totalSavings: 12 });
  });

  it("counts a live perk with no estimate as a deal worth nothing", () => {
    expect(
      summarizeLivePerks([
        { status: "published", estimated_savings: null },
        { status: "published", estimated_savings: 6 },
      ])
    ).toEqual({ count: 2, totalSavings: 6 });
  });

  it("is zero when nothing is live", () => {
    expect(summarizeLivePerks([])).toEqual({ count: 0, totalSavings: 0 });
    expect(summarizeLivePerks([{ status: "coming_soon", estimated_savings: 5 }])).toEqual({
      count: 0,
      totalSavings: 0,
    });
  });
});
