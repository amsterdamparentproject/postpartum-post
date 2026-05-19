import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/webhooks/stripe/route";

// --- Mocks ---

const { mockConstructEvent, mockRetrieve } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRetrieve: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve },
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

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
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
