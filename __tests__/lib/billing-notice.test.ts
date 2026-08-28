import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { deriveBillingNotice, fetchBillingNoticeContext } from "@/lib/billing-notice";
import { GIFT_ENTITLEMENT_NOTE } from "@/lib/match-ledger";

// ── deriveBillingNotice — pure, no DB/Stripe (Track C4) ──────────────────

describe("deriveBillingNotice — comped (FYP)", () => {
  it("shows nothing, regardless of counter or plan shape", () => {
    for (const priceLookupKey of ["fyp_monthly_single", "fyp_monthly_multi"]) {
      expect(
        deriveBillingNotice({
          priceLookupKey,
          intervalCount: 1,
          matchesRemaining: 0,
          lastTermPaymentNote: null,
        })
      ).toEqual({ kind: "none" });
    }
  });
});

describe("deriveBillingNotice — bundle plans", () => {
  const base = {
    priceLookupKey: "commitment_3mo",
    intervalCount: 3,
    lastTermPaymentNote: null,
  };

  it("shows the counter while 2+ matches remain, with no renewDate", () => {
    expect(deriveBillingNotice({ ...base, matchesRemaining: 3 })).toEqual({
      kind: "counter",
      matchesRemaining: 3,
      renewDate: undefined,
    });
  });

  // Copy pass, 2026-08-27: at exactly 1 match left, the counter now also
  // carries the date of the renew-check that actually applies to this
  // member — next month's 10th (renewCheckDateAfterNextRound), not the
  // sooner date nextRenewCheckDate would give, since their last match
  // still gets used in next month's round before they hit zero.
  it("includes next month's renew-check date at exactly 1 match left", () => {
    const result = deriveBillingNotice({
      ...base,
      matchesRemaining: 1,
      today: new Date("2026-08-07T00:00:00Z"),
    });
    expect(result).toEqual({
      kind: "counter",
      matchesRemaining: 1,
      renewDate: "10 September 2026",
    });
  });

  it("goes loud when the counter hits zero, with date and amount", () => {
    const result = deriveBillingNotice({
      ...base,
      matchesRemaining: 0,
      today: new Date("2026-08-07T00:00:00Z"),
    });
    expect(result).toEqual({
      kind: "loud",
      renewDate: "10 August 2026",
      amount: "€24",
      isFirstAfterGift: false,
      cancelUrl: expect.stringContaining("/billing"),
    });
  });

  it("marks isFirstAfterGift when the most recent term_payment was gift-covered", () => {
    const result = deriveBillingNotice({
      ...base,
      matchesRemaining: 0,
      lastTermPaymentNote: GIFT_ENTITLEMENT_NOTE,
      today: new Date("2026-08-10T00:00:00Z"),
    });
    expect(result.kind).toBe("loud");
    expect((result as { isFirstAfterGift: boolean }).isFirstAfterGift).toBe(true);
  });

  it("does not treat an unrelated or backfill note as a gift", () => {
    for (const note of ["seeded at cutover: term_end=2026-10-05", "", null]) {
      const result = deriveBillingNotice({
        ...base,
        matchesRemaining: 0,
        lastTermPaymentNote: note,
      });
      expect((result as { isFirstAfterGift: boolean }).isFirstAfterGift).toBe(false);
    }
  });

  it("uses the right per-term amount for founding_member and commitment_6mo", () => {
    const founding = deriveBillingNotice({
      priceLookupKey: "founding_member",
      intervalCount: 3,
      matchesRemaining: 0,
      lastTermPaymentNote: null,
    });
    expect((founding as { amount: string | null }).amount).toBe("€15");

    const sixMonth = deriveBillingNotice({
      priceLookupKey: "commitment_6mo",
      intervalCount: 6,
      matchesRemaining: 0,
      lastTermPaymentNote: null,
    });
    expect((sixMonth as { amount: string | null }).amount).toBe("€48");
  });

  it("falls back to a null amount for an unrecognized lookup key rather than throwing", () => {
    const result = deriveBillingNotice({
      priceLookupKey: "some_future_plan",
      intervalCount: 2,
      matchesRemaining: 0,
      lastTermPaymentNote: null,
    });
    expect((result as { amount: string | null }).amount).toBeNull();
  });

  it("cancel link carries a distinct utm_content from the footer's manage-subscription link", () => {
    const result = deriveBillingNotice({ ...base, matchesRemaining: 0 });
    const url = (result as { cancelUrl: string }).cancelUrl;
    expect(url).toContain("utm_content=renewal-notice");
    expect(url).not.toContain("manage-subscription");
  });
});

// Copy pass, 2026-08-27: the monthly "quiet" renewal reminder is retired
// entirely (see lib/billing-notice.ts's doc comment) — a monthly member
// already knows what they signed up for, so the reveal email carries no
// billing content for them at all now, same as a comped member.
describe("deriveBillingNotice — monthly plan", () => {
  const base = {
    priceLookupKey: "standard_monthly",
    intervalCount: 1,
    lastTermPaymentNote: null,
  };

  it("shows nothing, regardless of the counter value", () => {
    for (const matchesRemaining of [0, 1, 2]) {
      const result = deriveBillingNotice({ ...base, matchesRemaining });
      expect(result).toEqual({ kind: "none" });
    }
  });

  it("treats null intervalCount as monthly (matches deriveMemberStatusMessage's convention)", () => {
    const result = deriveBillingNotice({
      priceLookupKey: "standard_monthly",
      intervalCount: null,
      matchesRemaining: 0,
      lastTermPaymentNote: null,
    });
    expect(result).toEqual({ kind: "none" });
  });
});

// ── fetchBillingNoticeContext — admin-context DB + Stripe fetch ──────────

const { mockRetrieve } = vi.hoisted(() => ({ mockRetrieve: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mockRetrieve },
  }),
}));

describe("fetchBillingNoticeContext", () => {
  let memberId: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("returns null when the member has no non-canceled subscription", async () => {
    const member = await seedMember();
    memberId = member.id;

    const result = await fetchBillingNoticeContext(createTestSupabase(), memberId);
    expect(result).toBeNull();
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("ignores a canceled subscription the same as having none", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(member.id, { status: "canceled" });

    const result = await fetchBillingNoticeContext(createTestSupabase(), memberId);
    expect(result).toBeNull();
  });

  it("fetches live price lookup_key and interval_count for the active subscription", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(member.id, { status: "active" });

    mockRetrieve.mockResolvedValue({
      items: {
        data: [{ price: { lookup_key: "commitment_3mo", recurring: { interval_count: 3 } } }],
      },
    });

    const result = await fetchBillingNoticeContext(createTestSupabase(), memberId);
    expect(result).toEqual({
      priceLookupKey: "commitment_3mo",
      intervalCount: 3,
      lastTermPaymentNote: null,
    });
  });

  it("reads the most recent term_payment note, ignoring older rows and other event types", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(member.id, { status: "active" });
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { lookup_key: "standard_monthly", recurring: { interval_count: 1 } } }] },
    });

    const supabase = createTestSupabase();
    // Older gift-covered term_payment, then a newer non-gift one, plus an
    // unrelated match_delivered row with no note at all — only the newest
    // term_payment's note should surface.
    await supabase.from("match_entitlements").insert([
      { member_id: memberId, event: "term_payment", delta: 1, note: GIFT_ENTITLEMENT_NOTE, created_at: "2026-06-05T00:00:00Z" },
      { member_id: memberId, event: "match_delivered", delta: -1, created_at: "2026-07-05T00:00:00Z" },
      { member_id: memberId, event: "term_payment", delta: 1, note: null, created_at: "2026-07-06T00:00:00Z" },
    ]);

    const result = await fetchBillingNoticeContext(supabase, memberId);
    expect(result?.lastTermPaymentNote).toBeNull();
  });

  it("falls back to null lookup fields (not a thrown error) when the Stripe fetch fails", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(member.id, { status: "active" });
    mockRetrieve.mockRejectedValue(new Error("Stripe unavailable"));

    const result = await fetchBillingNoticeContext(createTestSupabase(), memberId);
    expect(result).toEqual({
      priceLookupKey: null,
      intervalCount: null,
      lastTermPaymentNote: null,
    });
  });
});
