import { describe, it, expect } from "vitest";
import { forEachWithConcurrency } from "@/lib/concurrency";

describe("forEachWithConcurrency", () => {
  it("processes every item and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await forEachWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      inFlight--;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it("handles an empty list", async () => {
    await expect(forEachWithConcurrency([], 3, async () => {})).resolves.toBeUndefined();
  });
});
