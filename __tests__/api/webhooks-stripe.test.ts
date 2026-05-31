import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/webhooks/stripe/route";
import { sendWelcomeEmail } from "@/lib/emails";

// --- Mocks ---

const { mockConstructEvent, mockRetrieve, mockUpdate } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve, update: mockUpdate },
  }),
}));

vi.mock("@/lib/emails", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
}));

// Helper — construct a minimal NextRequest with a fake stripe-signature header
function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": "test_sig" },
  });
}

describe("Stripe webhook", () => {
  let memberId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("sets member status to active and creates a subscription row on checkout.session.completed", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_test_monthly" } }] },
    });

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: memberId },
          customer_details: { email: member.email, name: "Test Member" },
          subscription: `sub_test_${memberId.slice(0, 8)}`,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const supabase = createTestSupabase();

    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("active");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, stripe_price_id")
      .eq("member_id", memberId)
      .single();
    expect(sub?.status).toBe("active");
    expect(sub?.stripe_price_id).toBe("price_test_monthly");
  });

  // ── Plan label tests ────────────────────────────────────────────────────

  function makeCheckoutEvent(memberId: string, email: string, lookupKey: string) {
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_test", lookup_key: lookupKey } }] },
      latest_invoice: { period_end: 1780000000 },
      billing_cycle_anchor: 1780000000,
    });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: memberId },
          customer_details: { email, name: "Test Member" },
          subscription: `sub_test_${memberId.slice(0, 8)}`,
        },
      },
    });
  }

  it("sends welcome email with 'Founding Member (€5/mo)' label for founding member subscribers", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    makeCheckoutEvent(memberId, member.email, "founding_member");

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      member.email,
      expect.any(String),
      expect.any(String),
      "Founding Member (€5/mo)",
      expect.any(String)
    );
  });

  it("sends welcome email with '3-month commitment (€8/mo)' label for regular 3-month subscribers", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    makeCheckoutEvent(memberId, member.email, "commitment_3mo");

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      member.email,
      expect.any(String),
      expect.any(String),
      "3-month commitment (€8/mo)",
      expect.any(String)
    );
  });

  it("sends welcome email with 'Monthly (€12/mo)' label for monthly subscribers", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    makeCheckoutEvent(memberId, member.email, "standard_monthly");

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      member.email,
      expect.any(String),
      expect.any(String),
      "Monthly (€12/mo)",
      expect.any(String)
    );
  });

  // ── Billing extension tests ──────────────────────────────────────────────

  it.each([
    // June 1: next match July 5 (different month) → extend
    ["June 1",    "2026-06-01T00:00:00Z", "2026-07-05T00:00:00Z", true],
    // August 4: next match August 5 (same month) → no extension
    ["August 4",  "2026-08-04T00:00:00Z", null, false],
    // August 20: next match September 5 (different month) → extend
    ["August 20", "2026-08-20T00:00:00Z", "2026-09-05T00:00:00Z", true],
  ])(
    "billing extension on %s signup: extends=%s",
    async (_label, signupDate, expectedTrialEnd, shouldExtend) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(signupDate));

      try {
        const member = await seedMember({ status: "pending" });
        memberId = member.id;
        makeCheckoutEvent(memberId, member.email, "commitment_3mo");

        const res = await POST(makeRequest("{}"));
        expect(res.status).toBe(200);

        if (shouldExtend) {
          const expected = Math.floor(new Date(expectedTrialEnd!).getTime() / 1000);
          expect(mockUpdate).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              trial_end: expected,
              proration_behavior: "none",
            })
          );
        } else {
          expect(mockUpdate).not.toHaveBeenCalled();
        }
      } finally {
        vi.useRealTimers();
      }
    }
  );

  // ── Cancellation test ────────────────────────────────────────────────────

  it("sets subscription status to canceled on customer.subscription.deleted", async () => {
    const member = await seedMember();
    memberId = member.id;

    const supabase = createTestSupabase();
    const stripeSubId = `sub_test_${memberId.slice(0, 8)}`;
    await supabase.from("subscriptions").insert({
      member_id: memberId,
      stripe_subscription_id: stripeSubId,
      stripe_price_id: "price_test_monthly",
      status: "active",
    });

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: stripeSubId,
          customer: member.stripe_customer_id,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", stripeSubId)
      .single();
    expect(sub?.status).toBe("canceled");
  });
});
