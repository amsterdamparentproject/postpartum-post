/**
 * Pure unit tests for lib/match-ledger.ts — no DB. See
 * __claude__/billing-simplification-plan.md §2.7 (B2 — seed derivation),
 * "the highest-risk untested thing in the plan" since it writes
 * entitlement for every live member in one shot.
 */

import { describe, it, expect } from "vitest";
import { countRoundsRemaining, deriveTermEnd, FYP_LOOKUP_KEYS } from "@/lib/match-ledger";

const TODAY = new Date("2026-08-26T00:00:00Z");

describe("countRoundsRemaining", () => {
  // Matches the plan's own worked table in §4 exactly (seed values at 2026-08-26).
  it.each([
    ["2026-10-05", 1], // founding_member ×16
    ["2026-11-04", 2], // founding_member ×3
    ["2026-11-05", 2], // founding_member ×3
    ["2026-10-01", 1], // commitment_3mo ×3
    ["2026-10-03", 1], // commitment_3mo ×3
    ["2026-11-05", 2], // commitment_3mo ×3 (duplicate term_end, different plan — same math)
    ["2026-12-05", 3], // commitment_3mo ×2
    ["2026-09-11", 1], // standard_monthly ×2
    ["2027-03-17", 7], // commitment_6mo ×1
  ])("term_end %s from 2026-08-26 -> %i", (termEndStr, expected) => {
    expect(countRoundsRemaining(TODAY, new Date(`${termEndStr}T00:00:00Z`))).toBe(expected);
  });

  it("does not count a round landing exactly on term_end — half-open interval", () => {
    // A term ending on a 5th gets that round from the renewal, not the seed.
    expect(countRoundsRemaining(TODAY, new Date("2026-09-05T00:00:00Z"))).toBe(0);
  });

  it("counts today's own round if today is before the 5th", () => {
    const earlyMonth = new Date("2026-08-02T00:00:00Z");
    // Aug 5 hasn't happened yet, so it counts; Sep 5 doesn't (excluded by term_end).
    expect(countRoundsRemaining(earlyMonth, new Date("2026-09-05T00:00:00Z"))).toBe(1);
  });

  it("rolls over correctly across a year boundary", () => {
    const today = new Date("2026-12-20T00:00:00Z");
    // Dec 5 already passed -> first candidate is Jan 5, then Feb 5.
    expect(countRoundsRemaining(today, new Date("2027-03-01T00:00:00Z"))).toBe(2);
  });

  it("returns 0 for a term_end already in the past, without going negative", () => {
    expect(countRoundsRemaining(TODAY, new Date("2026-08-01T00:00:00Z"))).toBe(0);
  });
});

describe("deriveTermEnd", () => {
  it("ignores trial_end when status is not 'trialing' — the appendix A trap", () => {
    // Sixteen Founding Members carry trial_end in the past while active;
    // reading it unconditionally would seed most of the member base to 0.
    const staleTrialEndPast = Math.floor(new Date("2026-07-05T00:00:00Z").getTime() / 1000);
    const realPeriodEnd = Math.floor(new Date("2026-10-05T00:00:00Z").getTime() / 1000);

    const termEnd = deriveTermEnd({
      status: "active",
      trial_end: staleTrialEndPast,
      items: { data: [{ current_period_end: realPeriodEnd }] },
    });

    expect(termEnd).toEqual(new Date("2026-10-05T00:00:00Z"));
  });

  it("uses trial_end while status is 'trialing'", () => {
    const trialEnd = Math.floor(new Date("2026-11-04T00:00:00Z").getTime() / 1000);
    const irrelevantPeriodEnd = Math.floor(new Date("2026-09-05T00:00:00Z").getTime() / 1000);

    const termEnd = deriveTermEnd({
      status: "trialing",
      trial_end: trialEnd,
      items: { data: [{ current_period_end: irrelevantPeriodEnd }] },
    });

    expect(termEnd).toEqual(new Date("2026-11-04T00:00:00Z"));
  });

  it("returns null when no usable term end is present", () => {
    const termEnd = deriveTermEnd({
      status: "active",
      trial_end: null,
      items: { data: [] },
    });
    expect(termEnd).toBeNull();
  });
});

describe("FYP_LOOKUP_KEYS", () => {
  it("excludes FYP's own products from the counter", () => {
    expect(FYP_LOOKUP_KEYS.has("fyp_monthly_single")).toBe(true);
    expect(FYP_LOOKUP_KEYS.has("fyp_monthly_multi")).toBe(true);
    expect(FYP_LOOKUP_KEYS.has("standard_monthly")).toBe(false);
  });
});
