import { describe, it, expect } from "vitest";
import { deriveMemberStatusMessage, nextRenewCheckDate } from "@/lib/member-status";

describe("nextRenewCheckDate", () => {
  it("returns this month's 20th when today is before it", () => {
    const result = nextRenewCheckDate(new Date("2026-08-05T00:00:00Z"));
    expect(result.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("returns next month's 20th when today is on or after it", () => {
    expect(nextRenewCheckDate(new Date("2026-08-20T00:00:00Z")).toISOString()).toBe(
      "2026-09-20T00:00:00.000Z"
    );
    expect(nextRenewCheckDate(new Date("2026-08-25T00:00:00Z")).toISOString()).toBe(
      "2026-09-20T00:00:00.000Z"
    );
  });

  it("rolls over into next year in December", () => {
    const result = nextRenewCheckDate(new Date("2026-12-25T00:00:00Z"));
    expect(result.toISOString()).toBe("2027-01-20T00:00:00.000Z");
  });
});

describe("deriveMemberStatusMessage — bundle plans (Track C1)", () => {
  const base = {
    stripeStatus: "active",
    priceLookupKey: "commitment_3mo",
    intervalCount: 3,
  };

  it("shows the counter when 2 or more matches remain", () => {
    expect(deriveMemberStatusMessage({ ...base, matchesRemaining: 3 })).toEqual({
      label: "Active — 3 matches left",
      tone: "active",
    });
    expect(deriveMemberStatusMessage({ ...base, matchesRemaining: 2 })).toEqual({
      label: "Active — 2 matches left",
      tone: "active",
    });
  });

  it("shows the last-match copy at exactly 1", () => {
    expect(deriveMemberStatusMessage({ ...base, matchesRemaining: 1 })).toEqual({
      label: "Last match of your bundle. Renews after this one.",
      tone: "active",
    });
  });

  it("shows the dated renewal with amount before the 20th", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-10T00:00:00Z"),
    });
    expect(result).toEqual({
      label: "Renews 20 August 2026 — €24",
      tone: "info",
    });
  });

  it("shows 'Renewing now' on or after the 20th", () => {
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-20T00:00:00Z") })
    ).toEqual({ label: "Renewing now", tone: "info" });
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-27T00:00:00Z") })
    ).toEqual({ label: "Renewing now", tone: "info" });
  });

  it("uses the right per-term amount for founding_member", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "active",
      priceLookupKey: "founding_member",
      intervalCount: 3,
      matchesRemaining: 0,
      today: new Date("2026-08-01T00:00:00Z"),
    });
    expect(result.label).toContain("€15");
  });
});

describe("deriveMemberStatusMessage — monthly plan (Track C1)", () => {
  const base = {
    stripeStatus: "active",
    priceLookupKey: "standard_monthly",
    intervalCount: 1,
  };

  it("never shows a matches-left count — just 'Active'", () => {
    expect(deriveMemberStatusMessage({ ...base, matchesRemaining: 1 })).toEqual({
      label: "Active",
      tone: "active",
    });
  });

  it("applies the same zero-counter renewal copy as a bundle, without bundle wording", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-05T00:00:00Z"),
    });
    expect(result).toEqual({ label: "Renews 20 August 2026 — €12", tone: "info" });
  });
});

describe("deriveMemberStatusMessage — terminal and payment states (Track C1)", () => {
  it("payment-needed states never leak Stripe's raw status", () => {
    for (const stripeStatus of ["past_due", "unpaid", "incomplete", "incomplete_expired"]) {
      const result = deriveMemberStatusMessage({
        stripeStatus,
        priceLookupKey: "standard_monthly",
        intervalCount: 1,
        matchesRemaining: 1,
      });
      expect(result).toEqual({ label: "Payment needed — update your card", tone: "warning" });
    }
  });

  it("canceled overrides everything else, including a comped lookup key", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "fyp_monthly_single",
      intervalCount: 1,
      matchesRemaining: 5,
    });
    expect(result).toEqual({ label: "Membership ended", tone: "muted" });
  });

  it("comped (FYP) members get their own copy regardless of the counter", () => {
    for (const priceLookupKey of ["fyp_monthly_single", "fyp_monthly_multi"]) {
      const result = deriveMemberStatusMessage({
        stripeStatus: "active",
        priceLookupKey,
        intervalCount: 1,
        matchesRemaining: 0,
      });
      expect(result).toEqual({
        label: "Included with your First Year Program",
        tone: "info",
      });
    }
  });

  it("comped takes precedence over a payment-needed status", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "past_due",
      priceLookupKey: "fyp_monthly_single",
      intervalCount: 1,
      matchesRemaining: 0,
    });
    expect(result.label).toBe("Included with your First Year Program");
  });
});
