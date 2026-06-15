import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { signup, abandonCheckout, type SignupFormData } from "@/app/actions/signup";
import { cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST as webhookPost } from "@/app/api/webhooks/stripe/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCustomerCreate,
  mockPricesList,
  mockSessionCreate,
  mockSessionRetrieve,
  mockSubscriptionRetrieve,
  mockConstructEvent,
} = vi.hoisted(() => ({
  mockCustomerCreate: vi.fn(),
  mockPricesList: vi.fn(),
  mockSessionCreate: vi.fn(),
  mockSessionRetrieve: vi.fn(),
  mockSubscriptionRetrieve: vi.fn(),
  mockConstructEvent: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: { create: mockCustomerCreate },
    prices: { list: mockPricesList },
    checkout: { sessions: { create: mockSessionCreate, retrieve: mockSessionRetrieve } },
    subscriptions: { retrieve: mockSubscriptionRetrieve, update: vi.fn().mockResolvedValue({}) },
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

// redirect is a no-op in tests — we assert it was called
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ host: "localhost:3000" })),
}));

vi.mock("@/lib/emails", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Shared constants and setup
// ---------------------------------------------------------------------------

let MOCK_CUSTOMER_ID = "cus_test_signup";
const MOCK_PRICE_ID = "price_test_3mo";
const MOCK_CHECKOUT_URL = "https://checkout.stripe.com/pay/test_session";
const MOCK_SUB_ID = "sub_test_signup_123";

function setupStripeMocks() {
  MOCK_CUSTOMER_ID = `cus_test_${crypto.randomUUID().slice(0, 8)}`;
  mockCustomerCreate.mockResolvedValue({ id: MOCK_CUSTOMER_ID });
  mockPricesList.mockResolvedValue({ data: [{ id: MOCK_PRICE_ID }] });
  mockSessionCreate.mockResolvedValue({ url: MOCK_CHECKOUT_URL });
  mockSubscriptionRetrieve.mockResolvedValue({
    items: { data: [{ price: { id: MOCK_PRICE_ID } }] },
  });
}

/** Clean up a test member by email (signup doesn't return the ID). */
async function cleanupByEmail(email: string) {
  const supabase = createTestSupabase();
  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (data?.id) await cleanupMember(data.id);
}

// ---------------------------------------------------------------------------
// signup action — unit / integration
// ---------------------------------------------------------------------------

describe("signup action", () => {
  let testEmail: string;

  beforeEach(() => {
    vi.clearAllMocks();
    setupStripeMocks();
    testEmail = `signup-test-${crypto.randomUUID()}@example.com`;
  });

  afterEach(async () => {
    await cleanupByEmail(testEmail);
  });

  it("creates a pending member in the DB with correct fields", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    const supabase = createTestSupabase();
    const { data: member } = await supabase
      .from("members")
      .select("status, first_name, last_name, email, stripe_customer_id")
      .eq("email", testEmail)
      .single();

    expect(member?.status).toBe("pending");
    expect(member?.first_name).toBe("Jane");
    expect(member?.last_name).toBe("Doe");
    expect(member?.email).toBe(testEmail);
    expect(member?.stripe_customer_id).toBe(MOCK_CUSTOMER_ID);
  });

  it("lowercases email before inserting", async () => {
    const mixedEmail = testEmail.replace("signup", "Signup");
    await signup({ firstName: "Jane", lastName: "Doe", email: mixedEmail, plan: "commitment_3mo" });

    const supabase = createTestSupabase();
    const { data: member } = await supabase
      .from("members")
      .select("email")
      .eq("email", mixedEmail.toLowerCase())
      .maybeSingle();

    expect(member).not.toBeNull();
    expect(member?.email).toBe(mixedEmail.toLowerCase());

    // Use lowercase for cleanup
    testEmail = mixedEmail.toLowerCase();
  });

  it("creates a Stripe customer with correct email, name, and member_id metadata", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    expect(mockCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: testEmail,
        name: "Jane Doe",
        metadata: expect.objectContaining({ member_id: expect.any(String) }),
      })
    );
  });

  it("looks up the commitment_3mo price for a 3-month plan", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    expect(mockPricesList).toHaveBeenCalledWith(
      expect.objectContaining({ lookup_keys: ["commitment_3mo"] })
    );
  });

  it("uses the founding_member price for first20_3mo plan, with no promo codes or discounts", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "first20_3mo" });

    expect(mockPricesList).toHaveBeenCalledWith(
      expect.objectContaining({ lookup_keys: ["founding_member"] })
    );

    const sessionArgs = mockSessionCreate.mock.calls[0][0];
    expect(sessionArgs).not.toHaveProperty("discounts");
    expect(sessionArgs).not.toHaveProperty("allow_promotion_codes");
  });

  it("allows promotion codes for non-FIRST20 plans", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    const sessionArgs = mockSessionCreate.mock.calls[0][0];
    expect(sessionArgs.allow_promotion_codes).toBe(true);
    expect(sessionArgs).not.toHaveProperty("discounts");
  });

  it("does not set trial_end in the checkout session (extension is applied post-checkout by the webhook)", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    const sessionArgs = mockSessionCreate.mock.calls[0][0];
    expect(sessionArgs.subscription_data?.trial_end).toBeUndefined();
  });

  it("redirects to the Stripe checkout URL", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    const { redirect } = await import("next/navigation");
    expect(redirect).toHaveBeenCalledWith(MOCK_CHECKOUT_URL);
  });

  it("returns 'already signed up' error for active members", async () => {
    const supabase = createTestSupabase();
    await supabase
      .from("members")
      .insert({ first_name: "Jane", last_name: "Doe", email: testEmail, status: "active" });

    const result = await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });
    expect(result).toEqual({ error: expect.stringContaining("You're already signed up!") });
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it("throws 'Price not found' if Stripe returns no matching price", async () => {
    mockPricesList.mockResolvedValue({ data: [] });

    await expect(
      signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" })
    ).rejects.toThrow("Price not found for plan: commitment_3mo");
  });

  it("throws 'Price not found' with founding_member key for first20_3mo plan", async () => {
    mockPricesList.mockResolvedValue({ data: [] });

    await expect(
      signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "first20_3mo" })
    ).rejects.toThrow("Price not found for plan: founding_member");
  });
});

// ---------------------------------------------------------------------------
// Abandoned checkout — re-signup flow
// ---------------------------------------------------------------------------

describe("abandoned checkout re-signup", () => {
  let testEmail: string;

  beforeEach(() => {
    vi.clearAllMocks();
    setupStripeMocks();
    testEmail = `abandon-test-${crypto.randomUUID()}@example.com`;
  });

  afterEach(async () => {
    await cleanupByEmail(testEmail);
  });

  it("allows a pending member to restart checkout without creating a new Stripe customer", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });
    vi.clearAllMocks();
    setupStripeMocks();

    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    expect(mockSessionCreate).toHaveBeenCalledTimes(1);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it("allows an abandoned member to re-subscribe without creating a new Stripe customer", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });
    const supabase = createTestSupabase();
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("email", testEmail)
      .single();
    await supabase.from("members").update({ status: "abandoned" }).eq("id", member!.id);

    vi.clearAllMocks();
    setupStripeMocks();

    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    expect(mockSessionCreate).toHaveBeenCalledTimes(1);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it("resets member status to pending when restarting checkout", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });
    const supabase = createTestSupabase();
    await supabase
      .from("members")
      .update({ status: "abandoned" })
      .eq("email", testEmail);

    vi.clearAllMocks();
    setupStripeMocks();

    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    const { data: member } = await supabase
      .from("members")
      .select("status")
      .eq("email", testEmail)
      .single();
    expect(member?.status).toBe("pending");
  });

  it("creates a new Stripe customer if the member record has no customer ID", async () => {
    const supabase = createTestSupabase();
    await supabase.from("members").insert({
      first_name: "Jane",
      last_name: "Doe",
      email: testEmail,
      status: "abandoned",
      stripe_customer_id: null,
    });

    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });

    expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
    expect(mockSessionCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// abandonCheckout action
// ---------------------------------------------------------------------------

describe("abandonCheckout", () => {
  let testEmail: string;

  beforeEach(() => {
    vi.clearAllMocks();
    setupStripeMocks();
    testEmail = `abandon-action-${crypto.randomUUID()}@example.com`;
  });

  afterEach(async () => {
    await cleanupByEmail(testEmail);
  });

  it("marks a pending member as abandoned", async () => {
    await signup({ firstName: "Jane", lastName: "Doe", email: testEmail, plan: "commitment_3mo" });
    const supabase = createTestSupabase();
    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("email", testEmail)
      .single();

    mockSessionRetrieve.mockResolvedValue({ metadata: { member_id: member!.id } });

    await abandonCheckout("cs_test_fake_session_id");

    const { data: updated } = await supabase
      .from("members")
      .select("status")
      .eq("id", member!.id)
      .single();
    expect(updated?.status).toBe("abandoned");
  });

  it("does not affect non-pending members", async () => {
    const supabase = createTestSupabase();
    const { data: member } = await supabase
      .from("members")
      .insert({ first_name: "Jane", last_name: "Doe", email: testEmail, status: "active" })
      .select("id")
      .single();

    mockSessionRetrieve.mockResolvedValue({ metadata: { member_id: member!.id } });

    await abandonCheckout("cs_test_fake_session_id");

    const { data: updated } = await supabase
      .from("members")
      .select("status")
      .eq("id", member!.id)
      .single();
    expect(updated?.status).toBe("active");
  });

  it("is a no-op when the session has no member_id metadata", async () => {
    mockSessionRetrieve.mockResolvedValue({ metadata: {} });
    await expect(abandonCheckout("cs_test_no_metadata")).resolves.toBeUndefined();
  });

  it("is a no-op when Stripe throws", async () => {
    mockSessionRetrieve.mockRejectedValue(new Error("Stripe error"));
    await expect(abandonCheckout("cs_test_stripe_error")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Full billing flow — E2E
// Chain the signup action (pending member) → webhook (active member + subscription)
// ---------------------------------------------------------------------------

describe("Billing flow — E2E", () => {
  let memberId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    setupStripeMocks();
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("signup creates a pending member; webhook activates it and creates a subscription row", async () => {
    const testEmail = `e2e-billing-${crypto.randomUUID()}@example.com`;

    // ── Step 1: user submits the signup form ─────────────────────────────
    await signup({
      firstName: "Jane",
      lastName: "Doe",
      email: testEmail,
      plan: "commitment_3mo",
    });

    const supabase = createTestSupabase();
    const { data: pendingMember } = await supabase
      .from("members")
      .select("id, status")
      .eq("email", testEmail)
      .single();

    expect(pendingMember?.status).toBe("pending");
    memberId = pendingMember!.id;

    // ── Step 2: Stripe fires checkout.session.completed ──────────────────
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: memberId },
          customer_details: { email: testEmail, name: "Jane Doe" },
          subscription: MOCK_SUB_ID,
        },
      },
    });
    mockSubscriptionRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: MOCK_PRICE_ID } }] },
    });

    const res = await webhookPost(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "test_sig" },
      })
    );
    expect(res.status).toBe(200);

    // ── Step 3: verify final state ────────────────────────────────────────
    const { data: activeMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(activeMember?.status).toBe("active");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, stripe_subscription_id, stripe_price_id")
      .eq("member_id", memberId)
      .single();
    expect(sub?.status).toBe("active");
    expect(sub?.stripe_subscription_id).toBe(MOCK_SUB_ID);
    expect(sub?.stripe_price_id).toBe(MOCK_PRICE_ID);
  });
});
