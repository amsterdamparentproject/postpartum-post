import { describe, it, expect } from "vitest";
import { deriveMemberStatusMessage, nextRenewCheckDate, renewCheckDateAfterNextRound } from "@/lib/member-status";

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

describe("renewCheckDateAfterNextRound", () => {
  it("always projects to next month's 10th, unconditionally", () => {
    // Sent the 7th (match-reveal day): their last match goes out in next
    // month's round (~5-7 Sep), decrementing them to zero, and the very
    // next renew-check after that (monthly, on the 10th) is 10 Sep — one
    // month out from the send date, not two.
    const result = renewCheckDateAfterNextRound(new Date("2026-08-07T00:00:00Z"));
    expect(result.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("rolls over into next year in December", () => {
    expect(renewCheckDateAfterNextRound(new Date("2026-12-07T00:00:00Z")).toISOString()).toBe(
      "2027-01-10T00:00:00.000Z"
    );
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

  // Copy pass, 2026-08-27: shortened to match the >=2 phrasing ("Active —
  // N left") rather than a full sentence — the "why"/"renews after this
  // one" detail moved into dateTooltip, surfaced next to the billing date
  // on /billing instead of crammed into the pill. Second pass, same day:
  // the tooltip now leads with the actual date (from currentPeriodEnd)
  // rather than a vague "this date" pointing at the row beside it.
  it("shows the shortened last-match copy at exactly 1, with a dated tooltip", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 1,
      currentPeriodEnd: Math.floor(new Date("2026-09-12T00:00:00Z").getTime() / 1000),
    });
    expect(result.label).toBe("Active — 1 match left");
    expect(result.tone).toBe("active");
    expect(result.dateTooltip).toBe(
      "Your subscription will renew on 12 September 2026 so that you continue receiving matches."
    );
    // Unlike the zero-counter renewal state, this one doesn't override the
    // billing-date row — Stripe's current_period_end is still the right
    // date here, since Track E1's renew-check date isn't in play yet.
    expect(result.renewsAt).toBeUndefined();
  });

  it("falls back to a dateless tooltip at exactly 1 match when currentPeriodEnd isn't available", () => {
    const result = deriveMemberStatusMessage({ ...base, matchesRemaining: 1 });
    expect(result.dateTooltip).toBe(
      "Your subscription will renew so that you continue receiving matches."
    );
  });

  // Copy pass, 2026-08-27: the pill itself is now a short relative label
  // ("Renews in N days"); the date/amount/match-grant detail that used to
  // be baked into the label moved into dateTooltip, and renewsAt exposes
  // the same date so /billing's "Next billing date" row can show it too.
  it("shows a relative renewal label with a full-detail tooltip before the 10th", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-05T00:00:00Z"),
    });
    expect(result.label).toBe("Renews in 5 days");
    expect(result.tone).toBe("info");
    expect(result.renewsAt?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(result.dateTooltip).toBe(
      "You will be charged €24 on 10 August 2026, which will grant you 3 more matches starting in September."
    );
  });

  it("says 'tomorrow' and 'today' at the edges of the renew-check window", () => {
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-09T00:00:00Z") }).label
    ).toBe("Renews tomorrow");
  });

  it("shows 'Renewing now' on or after the 10th", () => {
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-10T00:00:00Z") })
    ).toEqual({ label: "Renewing now", tone: "info" });
    expect(
      deriveMemberStatusMessage({ ...base, matchesRemaining: 0, today: new Date("2026-08-27T00:00:00Z") })
    ).toEqual({ label: "Renewing now", tone: "info" });
  });

  it("shows 'payment processing' when the renewal invoice is submitted but unsettled, even before the 10th", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-05T00:00:00Z"),
      latestInvoiceOpenAndAttempted: true,
    });
    expect(result).toEqual({
      label: "Renewal — Payment processing",
      tone: "info",
      tooltip: "We'll match you again once your payment clears. This can take a few weeks. Go to Manage billing for more information.",
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
    expect(result.dateTooltip).toContain("€15");
  });

  it("uses the right per-term amount for commitment_6mo, an archived price with a live subscriber", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "active",
      priceLookupKey: "commitment_6mo",
      intervalCount: 6,
      matchesRemaining: 0,
      today: new Date("2026-08-01T00:00:00Z"),
    });
    expect(result.dateTooltip).toContain("€48");
    expect(result.dateTooltip).toContain("6 more matches");
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

  it("applies the same zero-counter renewal copy as a bundle, without bundle wording, granting a single match", () => {
    const result = deriveMemberStatusMessage({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-05T00:00:00Z"),
    });
    expect(result.label).toBe("Renews in 5 days");
    expect(result.tone).toBe("info");
    expect(result.dateTooltip).toBe(
      "You will be charged €12 on 10 August 2026, which will grant you 1 more match starting in September."
    );
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

  it("canceled with a zero counter overrides everything else, including a comped lookup key", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "fyp_monthly_single",
      intervalCount: 1,
      matchesRemaining: 0,
    });
    expect(result).toEqual({ label: "Membership ended", tone: "muted" });
  });

  // Bug fix, 2026-08-28: "canceled" no longer means "Membership ended"
  // outright. Self-cancellation via /billing (app/actions/unsubscribe.ts)
  // sets cancel_at_period_end rather than canceling immediately, so
  // stripeStatus only flips to "canceled" once the term is fully used up
  // — but the Stripe customer billing portal's cancel-immediately-or-at-
  // period-end behavior is a Stripe Dashboard setting we don't control
  // from this codebase, so a member could in principle reach "canceled"
  // mid-term with matches still owed. Gating "Membership ended" on the
  // counter keeps that member from seeing a premature, wrong message.
  it("falls through to the ordinary matches-remaining state when canceled but matches are still owed", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "commitment_3mo",
      intervalCount: 3,
      matchesRemaining: 2,
    });
    expect(result.label).toBe("Active — 2 matches left");
    expect(result.tone).toBe("active");
  });

  // A canceled comped/FYP member with matches still owed falls all the
  // way through to the FYP branch (checked right after this one), since
  // the counter guard makes "canceled" a no-op when matches remain — so a
  // canceled comped member looks identical to an active one until their
  // matches actually run out. Flagged as a real behavior, not asserted
  // against here as "correct" or "wrong" — worth a product call if it
  // matters in practice, e.g. by fetching cancel_at_period_end/canceled
  // status. Also see "comped takes precedence" below.
  it("a canceled comped member with matches remaining reads as an ordinary active FYP member", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      priceLookupKey: "fyp_monthly_single",
      intervalCount: 1,
      matchesRemaining: 1,
    });
    expect(result.label).toBe("Active");
    expect(result.planTooltip).toBe("Included with your First Year Program plan");
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
      label: "Renewal failed",
      tone: "warning",
      tooltip: "We couldn't process your renewal. Please update your payment details or contact us.",
    });
  });

  // Unlike the plain "canceled" branch, this one isn't gated on the
  // counter — Track E1 only ever attempts a renewal charge once a member
  // is already at zero, so a mandate-failure cancellation is inherently a
  // zero-counter event by construction. Asserted here defensively anyway,
  // in case that assumption ever stops holding.
  it("a mandate-failure cancellation shows regardless of the counter", () => {
    const result = deriveMemberStatusMessage({
      stripeStatus: "canceled",
      cancellationReason: "payment_failed",
      priceLookupKey: "standard_monthly",
      intervalCount: 1,
      matchesRemaining: 3,
    });
    expect(result.label).toBe("Renewal failed");
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

  // Copy pass, 2026-08-27: the pill itself now reads a plain "Active",
  // same as any other active member — the FYP explanation moved to
  // planTooltip, meant to annotate a "Plan: Monthly" row on /billing
  // rather than replace the Status pill's own label.
  it("comped (FYP) members show a plain Active pill with the explanation in planTooltip", () => {
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
