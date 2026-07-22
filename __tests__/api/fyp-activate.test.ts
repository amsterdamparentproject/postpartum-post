/**
 * Integration tests for POST /api/fyp/activate
 *
 * Real test Supabase DB (postpartumpost schema), mocked Stripe — mirrors
 * the convention in __tests__/api/webhooks-stripe.test.ts and
 * __tests__/api/run-matcher.test.ts.
 *
 * Covers:
 *   - Auth enforcement
 *   - Field validation, incl. planType and bundleExpiresAt
 *   - Existing member, with a live subscription -> comps it in place via
 *     subscriptions.update(), no new Stripe objects
 *   - Existing member, no live subscription (none at all, or a terminal
 *     one) -> a fresh comped subscription for their EXISTING Stripe
 *     customer (never a new customer)
 *   - No existing member, planType "monthly" -> creates Stripe customer +
 *     subscription with the shared forever coupon (FYP_COMP_COUPON_ID), a
 *     members row, and a subscriptions row
 *   - No existing member, planType "bundle" -> looks up (or creates, on first
 *     use) a coupon keyed by a deterministic id sized to bundleExpiresAt,
 *     and applies it
 *   - Race condition on insert (23505) -> falls back to the existing row
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import {
  seedMember,
  seedSubscription,
  cleanupMember,
  createTestSupabase,
} from "@tests/helpers";
import { POST } from "@/app/api/fyp/activate/route";

// --- Mocks ---

const {
  mockPricesList,
  mockCustomersCreate,
  mockSubscriptionsCreate,
  mockSubscriptionsUpdate,
  mockCouponsCreate,
  mockCouponsRetrieve,
} = vi.hoisted(() => ({
  mockPricesList: vi.fn(),
  mockCustomersCreate: vi.fn(),
  mockSubscriptionsCreate: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
  mockCouponsCreate: vi.fn(),
  mockCouponsRetrieve: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    prices: { list: mockPricesList },
    customers: { create: mockCustomersCreate },
    subscriptions: {
      create: mockSubscriptionsCreate,
      update: mockSubscriptionsUpdate,
    },
    coupons: { create: mockCouponsCreate, retrieve: mockCouponsRetrieve },
  }),
}));

// The route's not-found check is `err.statusCode === 404 && err.code ===
// "resource_missing"` on a real Stripe.errors.StripeError — "@/lib/stripe"
// is mocked above, but the "stripe" package itself isn't, so constructing a
// real error class here exercises the exact same instanceof check the
// route runs in production.
function missingCouponError() {
  return new Stripe.errors.StripeInvalidRequestError({
    statusCode: 404,
    code: "resource_missing",
    message: "No such coupon",
  });
}

const SECRET = "test-fyp-activate-secret";
const FOREVER_COUPON_ID = "coupon_fyp_comp_forever";

function makeRequest(
  body: Record<string, unknown> = {},
  authSecret: string | null = SECRET,
) {
  return new NextRequest("http://localhost/api/fyp/activate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(authSecret ? { authorization: `Bearer ${authSecret}` } : {}),
    },
  });
}

describe("POST /api/fyp/activate", () => {
  let memberId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FYP_ACTIVATE_API_SECRET = SECRET;
    process.env.FYP_COMP_COUPON_ID = FOREVER_COUPON_ID;
    mockPricesList.mockResolvedValue({
      data: [
        {
          id: "price_standard_monthly",
          product: "prod_standard_monthly",
        },
      ],
    });
    mockCustomersCreate.mockResolvedValue({ id: "cus_test_activate" });
    mockSubscriptionsCreate.mockResolvedValue({ id: "sub_test_activate" });
    mockSubscriptionsUpdate.mockResolvedValue({});
    // Default: the shared bundle coupon for this duration doesn't exist yet
    // (the common "first family at this duration" case) — creates it, and
    // echoes back the deterministic id it was asked to create so tests can
    // assert on it without hardcoding a duration.
    mockCouponsRetrieve.mockRejectedValue(missingCouponError());
    mockCouponsCreate.mockImplementation(async (params: { id: string }) => ({
      id: params.id,
    }));
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await POST(
      makeRequest(
        {
          email: "x@example.com",
          firstName: "A",
          lastName: "B",
          planType: "monthly",
        },
        null,
      ),
    );
    expect(res.status).toBe(401);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await POST(
      makeRequest(
        {
          email: "x@example.com",
          firstName: "A",
          lastName: "B",
          planType: "monthly",
        },
        "wrong-secret",
      ),
    );
    expect(res.status).toBe(401);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it("rejects a request missing required fields", async () => {
    const res = await POST(makeRequest({ email: "x@example.com" }));
    expect(res.status).toBe(400);
  });

  it("rejects a request with an invalid planType", async () => {
    const res = await POST(
      makeRequest({
        email: "x@example.com",
        firstName: "A",
        lastName: "B",
        planType: "yearly",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a bundle request missing bundleExpiresAt", async () => {
    const res = await POST(
      makeRequest({
        email: "x@example.com",
        firstName: "A",
        lastName: "B",
        planType: "bundle",
      }),
    );
    expect(res.status).toBe(400);
  });

  describe("existing PP member", () => {
    it("with a live (active) subscription — comps it via subscriptions.update, no new Stripe objects", async () => {
      const member = await seedMember();
      memberId = member.id;
      const sub = await seedSubscription(member.id, {
        stripe_subscription_id: "sub_existing_active",
        status: "active",
      });

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        postpartumpost_member_id: member.id,
        created: false,
      });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        sub.stripe_subscription_id,
        { discounts: [{ coupon: FOREVER_COUPON_ID }] },
      );
      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
      expect(mockCouponsCreate).not.toHaveBeenCalled();
    });

    it("with a live subscription, bundle plan — looks up/creates the bundle coupon and applies it via update", async () => {
      const member = await seedMember();
      memberId = member.id;
      const sub = await seedSubscription(member.id, {
        stripe_subscription_id: "sub_existing_bundle",
        status: "active",
      });

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "bundle",
          bundleExpiresAt: "2099-01-01",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.created).toBe(false);

      expect(mockCouponsRetrieve).toHaveBeenCalledTimes(1);
      const couponId = mockCouponsRetrieve.mock.calls[0][0] as string;
      expect(couponId).toMatch(/^fyp-bundle-\d+mo$/);

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        sub.stripe_subscription_id,
        { discounts: [{ coupon: couponId }] },
      );
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
      expect(mockCustomersCreate).not.toHaveBeenCalled();
    });

    it("with no subscription row at all — creates a fresh comped subscription for their EXISTING customer, not a new one", async () => {
      const member = await seedMember();
      memberId = member.id;
      // No seedSubscription call — this member has never had one.

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        postpartumpost_member_id: member.id,
        created: false,
      });

      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
      expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: member.stripe_customer_id,
          discounts: [{ coupon: FOREVER_COUPON_ID }],
        }),
      );

      const db = createTestSupabase();
      const { data: sub } = await db
        .from("subscriptions")
        .select("*")
        .eq("member_id", member.id)
        .single();
      expect(sub.stripe_subscription_id).toBe("sub_test_activate");
      expect(sub.status).toBe("active");
    });

    it("with only a terminal-status subscription (canceled) — creates a fresh comped subscription rather than reviving the old one", async () => {
      const member = await seedMember();
      memberId = member.id;
      await seedSubscription(member.id, {
        stripe_subscription_id: "sub_old_canceled",
        status: "canceled",
      });

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.created).toBe(false);

      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: member.stripe_customer_id,
          discounts: [{ coupon: FOREVER_COUPON_ID }],
        }),
      );
    });

    it("with no stripe_customer_id on file — logs and still returns the link, uncomped", async () => {
      const member = await seedMember({ stripe_customer_id: "" });
      memberId = member.id;

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        postpartumpost_member_id: member.id,
        created: false,
      });
      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("fails closed (500) if FYP_COMP_COUPON_ID isn't set when a fresh subscription is needed", async () => {
      delete process.env.FYP_COMP_COUPON_ID;
      const member = await seedMember();
      memberId = member.id;

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );

      expect(res.status).toBe(500);
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("returns 500 if the Stripe update call fails on a live subscription", async () => {
      const member = await seedMember();
      memberId = member.id;
      await seedSubscription(member.id, {
        stripe_subscription_id: "sub_will_fail_update",
        status: "active",
      });
      mockSubscriptionsUpdate.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );

      expect(res.status).toBe(500);
    });

    it("returns 500 if creating a fresh subscription fails", async () => {
      const member = await seedMember();
      memberId = member.id;
      mockSubscriptionsCreate.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(
        makeRequest({
          email: member.email,
          firstName: "Whatever",
          lastName: "Ignored",
          planType: "monthly",
        }),
      );

      expect(res.status).toBe(500);
    });
  });

  it("monthly plan: creates a Stripe customer + subscription comped with the shared forever coupon", async () => {
    const email = `fyp-activate-${crypto.randomUUID()}@example.com`;

    const res = await POST(
      makeRequest({
        email,
        firstName: "New",
        lastName: "Parent",
        planType: "monthly",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(true);
    memberId = body.postpartumpost_member_id;

    // No per-activation coupon created for monthly plans — the shared,
    // pre-created forever coupon is reused instead.
    expect(mockCouponsCreate).not.toHaveBeenCalled();

    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email, name: "New Parent" }),
    );

    // Stripe: subscription created directly (no Checkout Session), coupon
    // applied at creation, no trial_end at all.
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test_activate",
        discounts: [{ coupon: FOREVER_COUPON_ID }],
      }),
    );
    const subArgs = mockSubscriptionsCreate.mock.calls[0][0];
    expect(subArgs.trial_end).toBeUndefined();

    // DB: member row
    const db = createTestSupabase();
    const { data: member } = await db
      .from("members")
      .select("*")
      .eq("id", memberId)
      .single();
    expect(member.email).toBe(email);
    expect(member.first_name).toBe("New");
    expect(member.last_name).toBe("Parent");
    expect(member.status).toBe("active");
    expect(member.stripe_customer_id).toBe("cus_test_activate");

    // DB: subscriptions row — required for grantFreeMonth() to find this member later
    const { data: sub } = await db
      .from("subscriptions")
      .select("*")
      .eq("member_id", memberId)
      .single();
    expect(sub.stripe_subscription_id).toBe("sub_test_activate");
    expect(sub.stripe_price_id).toBe("price_standard_monthly");
    expect(sub.status).toBe("active");
  });

  it("monthly plan: fails closed (500) if FYP_COMP_COUPON_ID isn't set", async () => {
    delete process.env.FYP_COMP_COUPON_ID;
    const email = `fyp-activate-noenv-${crypto.randomUUID()}@example.com`;

    const res = await POST(
      makeRequest({
        email,
        firstName: "New",
        lastName: "Parent",
        planType: "monthly",
      }),
    );

    expect(res.status).toBe(500);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it("bundle plan: coupon doesn't exist yet — creates it with a deterministic id and descriptive name", async () => {
    const email = `fyp-activate-bundle-${crypto.randomUUID()}@example.com`;
    // Comfortably in the future so the computed duration_in_months is
    // deterministic-ish (>= 1) regardless of when this test runs.
    const bundleExpiresAt = "2099-01-01";

    const res = await POST(
      makeRequest({
        email,
        firstName: "Bundle",
        lastName: "Parent",
        planType: "bundle",
        bundleExpiresAt,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(true);
    memberId = body.postpartumpost_member_id;

    // Looked up first, by the deterministic id — not created outright.
    expect(mockCouponsRetrieve).toHaveBeenCalledTimes(1);
    const couponId = mockCouponsRetrieve.mock.calls[0][0] as string;
    expect(couponId).toMatch(/^fyp-bundle-\d+mo$/);
    const months = Number(couponId.match(/^fyp-bundle-(\d+)mo$/)![1]);
    expect(months).toBeGreaterThan(1);

    // Not found -> created with that same id and a human-readable name.
    expect(mockCouponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: couponId,
        name: `Postpartum Post for FYP bundle — ${months} months`,
        percent_off: 100,
        duration: "repeating",
        duration_in_months: months,
        applies_to: { products: ["prod_standard_monthly"] },
      }),
    );

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test_activate",
        discounts: [{ coupon: couponId }],
      }),
    );
  });

  it("bundle plan: reuses an existing coupon for the same duration instead of creating a new one", async () => {
    const email = `fyp-activate-bundle-reuse-${crypto.randomUUID()}@example.com`;
    mockCouponsRetrieve.mockReset();
    mockCouponsRetrieve.mockResolvedValueOnce({ id: "fyp-bundle-9mo" });

    const res = await POST(
      makeRequest({
        email,
        firstName: "Bundle",
        lastName: "Reuse",
        planType: "bundle",
        bundleExpiresAt: "2099-01-01",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(true);
    memberId = body.postpartumpost_member_id;

    expect(mockCouponsRetrieve).toHaveBeenCalledTimes(1);
    expect(mockCouponsCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: "fyp-bundle-9mo" }],
      }),
    );
  });

  it("lowercases the email before lookup and insert", async () => {
    const email = `Mixed-Case-${crypto.randomUUID()}@Example.com`;

    const res = await POST(
      makeRequest({
        email,
        firstName: "Case",
        lastName: "Test",
        planType: "monthly",
      }),
    );
    const body = await res.json();
    memberId = body.postpartumpost_member_id;

    const db = createTestSupabase();
    const { data: member } = await db
      .from("members")
      .select("email")
      .eq("id", memberId)
      .single();
    expect(member?.email).toBe(email.toLowerCase());
  });

  it("is idempotent: calling activate again for an already-linked, already-comped email creates no new Stripe objects", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(member.id, { status: "active" });

    const res = await POST(
      makeRequest({
        email: member.email,
        firstName: "Doesnt",
        lastName: "Matter",
        planType: "monthly",
      }),
    );
    const body = await res.json();

    expect(body.postpartumpost_member_id).toBe(member.id);
    expect(body.created).toBe(false);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });
});

// ─── Race condition: two activate requests for the same brand-new email ─────
//
// The route's own lookup-then-insert isn't atomic, so a genuine race (two
// concurrent requests for an email neither has seen yet) can have both reach
// the insert; the loser gets a 23505 and should fall back to reading the
// winner's row rather than erroring. Mocked Supabase (not the real DB) since
// forcing a real race deterministically isn't practical here — this isolates
// just the fallback branch's logic.
describe("POST /api/fyp/activate — race on insert", () => {
  const EXISTING_ID = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.resetModules();
    process.env.FYP_ACTIVATE_API_SECRET = SECRET;
    process.env.FYP_COMP_COUPON_ID = FOREVER_COUPON_ID;
  });

  it("falls back to the pre-existing row when the members insert hits a unique violation", async () => {
    vi.doMock("@/lib/stripe", () => ({
      getStripe: () => ({
        prices: {
          list: vi.fn().mockResolvedValue({
            data: [{ id: "price_x", product: "prod_x" }],
          }),
        },
        customers: { create: vi.fn().mockResolvedValue({ id: "cus_race" }) },
        subscriptions: {
          create: vi.fn().mockResolvedValue({ id: "sub_race" }),
          update: vi.fn(),
        },
        coupons: { create: vi.fn(), retrieve: vi.fn() },
      }),
    }));

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "members") {
            let call = 0;
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    call += 1;
                    // First call (the route's initial lookup): not found yet.
                    if (call === 1) return { data: null, error: null };
                    return { data: null, error: null };
                  },
                  single: async () => ({
                    data: { id: EXISTING_ID },
                    error: null,
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: { code: "23505", message: "duplicate key" },
                  }),
                }),
              }),
            };
          }
          // subscriptions table — unreachable in this test since the member
          // insert fails before we'd ever get here, but kept harmless.
          return { insert: async () => ({ error: null }) };
        },
      }),
    }));

    const { POST: POST_race } = await import("@/app/api/fyp/activate/route");
    const res = await POST_race(
      makeRequest({
        email: "race@example.com",
        firstName: "Race",
        lastName: "Condition",
        planType: "monthly",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      postpartumpost_member_id: EXISTING_ID,
      created: false,
    });
  });
});
