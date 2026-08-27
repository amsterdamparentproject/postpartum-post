import { describe, it, expect } from "vitest";
import { deriveMemberStatusMessage, nextRenewCheckDate } from "@/lib/member-status";

describe("nextRenewCheckDate", () => {
  it("returns this month's 10th when today is before it", () => {
    const result = nextRenewCheckDate(new Date("2026-08-05T00:00:00Z"));
    expect(result.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("returns next month's 10th when today is on or after it", () => {
    expect(nextRenewCheckDate(new Date("2026-08-10T00:00:00Z")).toISOString()).toBe(
      "2026-09-10T00:00:00.000Z"
    );
    expect(nextRenewCheckDate(new Date("2026-08-25T00:00:00Z")).toISOString()).toBe(
      "2026-09-10T00:00:00.000Z"
    );
  });

  it("rolls over into next year in December", () => {
    const result = nextRenewCheckDate(new Date("2026-12-25T00:00:00Z"));
    expect(result.toISOString()).toBe("2027-01-10T00:00:00.000Z");
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

  it("shows the last-match copy at exactly 1, with a tooltip naming the next renewal check date", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 1,
      today: new Date("2026-08-05T00:00:00Z"),
    });
    expect(result).toEqual({
      label: "Active — 1 match left",
      tone: "active",
      dateTooltip: "Your subscription will renew on 10 August 2026 so that you continue receiving matches.",
    });
  });

  it("shows the dated renewal with amount before the 10th", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-05T00:00:00Z"),
    });
    expect(result).toEqual({
      label: "Renews 10 August 2026 — €24",
      tone: "info",
    });
  });

  it("shows 'Renewing soon' on or after the 10th", () => {
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-10T00:00:00Z") })
    ).toEqual({ label: "Renewing soon", tone: "info" });
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-27T00:00:00Z") })
    ).toEqual({ label: "Renewing soon", tone: "info" });
  });

  it("shows 'payment processing' when the renewal invoice is submitted but unsettled, even before the 10th", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-05T00:00:00Z"),
      latestInvoiceOpenAndAttempted: true,
    });
    expect(result).toEqual({
      label: "Payment processing — you'll be matched once it clears (can take a few weeks for bank transfers)",
      tone: "info",
    });
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

  it("uses the right per-term amount for commitment_6mo, an archived price with a live subscriber", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "active",
      priceLookupKey: "commitment_6mo",
      intervalCount: 6,
      matchesRemaining: 0,
      today: new Date("2026-08-01T00:00:00Z"),
    });
    expect(result.label).toContain("€48");
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
    expect(result).toEqual({ label: "Renews 10 August 2026 — €12", tone: "info" });
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
      expect(result).toEqual({ label: "Payment needed — Update your card", tone: "warning" });
    }
  });

  it("shows 'Membership ended' when canceled with no matches left", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "standard_monthly",
      intervalCount: 1,
      matchesRemaining: 0,
    });
    expect(result).toEqual({ label: "Membership ended", tone: "muted" });
  });

  it("does not show 'Membership ended' if canceled but matches remain (e.g. an immediate-cancel billing portal config)", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "commitment_3mo",
      intervalCount: 3,
      matchesRemaining: 2,
    });
    expect(result).toEqual({ label: "Active — 2 matches left", tone: "active" });
  });

  it("canceled with matches remaining still shows the comped FYP copy, not 'Membership ended'", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "fyp_monthly_single",
      intervalCount: 1,
      matchesRemaining: 5,
    });
    expect(result).toEqual({
      label: "Active",
      tone: "active",
      planTooltip: "Included with your First Year Program plan",
    });
  });

  // Track D case 6b: Stripe cancels a subscription outright — rather than
  // going past_due and retrying, like it does for a card — when it judges a
  // SEPA mandate/account mismatch unusable. A member here didn't choose to
  // leave, so this gets its own message distinct from a self-cancellation.
  it("a mandate-failure cancellation gets its own message, not 'Membership ended'", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      cancellationReason: "payment_failed",
      priceLookupKey: "standard_monthly",
      intervalCount: 1,
      matchesRemaining: 0,
    });
    expect(result).toEqual({
      label: "We couldn't process your renewal — please update your payment details or contact us.",
      tone: "warning",
    });
  });

  it("a self-cancellation (no payment_failed reason) still shows 'Membership ended'", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      cancellationReason: "cancellation_requested",
      priceLookupKey: "standard_monthly",
      intervalCount: 1,
      matchesRemaining: 0,
    });
    expect(result).toEqual({ label: "Membership ended", tone: "muted" });
  });

  it("comped (FYP) members show a plain Active pill with an explanatory plan tooltip, regardless of the counter", () => {
    for (const priceLookupKey of ["fyp_monthly_single", "fyp_monthly_multi"]) {
      const result = deriveMemberStatusMessage({
        stripeStatus: "active",
        priceLookupKey,
        intervalCount: 1,
        matchesRemaining: 0,
      });
      expect(result).toEqual({
        label: "Active",
        tone: "active",
        planTooltip: "Included with your First Year Program plan",
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
    expect(result.label).toBe("Active");
    expect(result.planTooltip).toBe("Included with your First Year Program plan");
  });
});
