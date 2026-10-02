/**
 * Integration tests for POST /api/send-optin-email — recipient selection.
 *
 * A "canceling" member who has used up their term (matches_remaining <= 0)
 * is only waiting for renew-check to finalize their cancellation and can't
 * opt in, so they must not receive the opt-in email. Active members at 0
 * still do (Track E3: the gate is at the click, not the send), and canceling
 * members with a match left still do.
 *
 * sendOptinEmail is mocked so no real emails are sent.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember } from "@tests/helpers";
import { POST } from "@/app/api/send-optin-email/route";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/emails", () => ({ sendOptinEmail: mockSend }));

// Members here have no subscription row, so fetchBillingNoticeContext never
// reaches Stripe; mocked anyway so a stray lookup can't hit the network.
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ subscriptions: { retrieve: vi.fn() } }),
}));

function makeRequest() {
  return new NextRequest("http://localhost/api/send-optin-email", {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.MATCHER_API_SECRET}`,
    },
  });
}

const seeded: string[] = [];
async function seed(overrides: Parameters<typeof seedMember>[0]) {
  const m = await seedMember(overrides);
  seeded.push(m.id);
  return m;
}

afterEach(async () => {
  mockSend.mockClear();
  await Promise.all(seeded.splice(0).map(cleanupMember));
});

function recipients(): string[] {
  return mockSend.mock.calls.map((c) => c[0] as string);
}

describe("POST /api/send-optin-email recipients", () => {
  it("skips a canceling member with no matches left", async () => {
    const m = await seed({ status: "canceling", matches_remaining: 0 });
    await POST(makeRequest());
    expect(recipients()).not.toContain(m.email);
  });

  it("sends to a canceling member who still has a match left", async () => {
    const m = await seed({ status: "canceling", matches_remaining: 1 });
    await POST(makeRequest());
    expect(recipients()).toContain(m.email);
  });

  it("still sends to an active member at zero matches", async () => {
    const m = await seed({ status: "active", matches_remaining: 0 });
    await POST(makeRequest());
    expect(recipients()).toContain(m.email);
  });

  it("sends to an active member with matches left", async () => {
    const m = await seed({ status: "active", matches_remaining: 3 });
    await POST(makeRequest());
    expect(recipients()).toContain(m.email);
  });
});
