import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// The route's own job is auth, strict body parsing and shaping the response.
// Who is eligible and the send itself live in lib/continue-offer-send.ts, so
// they are mocked here (no database or Stripe needed).
const { mockSend, mockGifted } = vi.hoisted(() => ({ mockSend: vi.fn(), mockGifted: vi.fn() }));
vi.mock("@/lib/continue-offer-send", () => ({ sendContinueOffers: mockSend }));
vi.mock("@/lib/gifted-continue-send", () => ({ sendGiftedContinueOffers: mockGifted }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({}) }));

import { POST } from "@/app/api/send-continue-offers/route";

const SECRET = "test-secret";

function req(body?: unknown, opts: { token?: string | null; query?: string } = {}) {
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? SECRET : opts.token;
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/send-continue-offers${opts.query ?? ""}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const RESULT = [
  {
    slug: "dsa",
    status: "ok",
    eligible: 1,
    sent: 1,
    failed: 0,
    members: [{ memberId: "m1", email: "private@example.test", outcome: "sent" }],
  },
];

describe("POST /api/send-continue-offers", () => {
  const original = process.env.MATCHER_API_SECRET;
  beforeEach(() => {
    process.env.MATCHER_API_SECRET = SECRET;
    mockSend.mockReset();
    mockSend.mockResolvedValue(RESULT);
    mockGifted.mockReset();
    mockGifted.mockResolvedValue([]);
  });
  afterEach(() => {
    process.env.MATCHER_API_SECRET = original;
  });

  it("500s when the secret is not configured", async () => {
    delete process.env.MATCHER_API_SECRET;
    expect((await POST(req())).status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("401s without the bearer token", async () => {
    expect((await POST(req(undefined, { token: null }))).status).toBe(401);
    expect((await POST(req(undefined, { token: "wrong" }))).status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("an empty body is a real run", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockSend.mock.calls[0][1]).toMatchObject({ dryRun: false, cohortSlug: undefined });
  });

  it("passes dryRun and cohort through", async () => {
    await POST(req({ dryRun: true, cohort: " dsa " }));
    expect(mockSend.mock.calls[0][1]).toMatchObject({ dryRun: true, cohortSlug: "dsa" });
  });

  it.each([
    ["a dry-run flag in the query string", undefined, "?dryRun=true"],
    ["a misspelled dry-run key", { dry_run: true }, ""],
    ["a non-boolean dryRun", { dryRun: "true" }, ""],
    ["invalid JSON", "{not json", ""],
    ["a JSON array", [1], ""],
    ["an empty cohort", { cohort: "  " }, ""],
  ])("400s on %s, and sends nothing", async (_name, body, query) => {
    const res = await POST(req(body, { query }));
    expect(res.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns summaries and member ids, never email addresses", async () => {
    const res = await POST(req());
    const json = await res.json();
    expect(json.cohorts[0]).toMatchObject({ slug: "dsa", sent: 1, eligible: 1 });
    expect(json.cohorts[0].members).toBeUndefined();
    expect(json.members).toEqual([{ memberId: "m1", cohort: "dsa", outcome: "sent" }]);
    expect(JSON.stringify(json)).not.toContain("private@example.test");
  });

  it("500s when sending throws", async () => {
    mockSend.mockRejectedValue(new Error("db down"));
    expect((await POST(req())).status).toBe(500);
  });

  it("adds the regular-price (no cohort offer) run to the response, as cohort \"regular-price\"", async () => {
    mockGifted.mockResolvedValue([
      { slug: "regular-price", status: "ok", eligible: 1, sent: 1, failed: 0, members: [{ memberId: "g1", email: "g@example.test", outcome: "sent" }] },
    ]);
    const body = await (await POST(req({}))).json();
    expect(body.cohorts.map((c: { slug: string }) => c.slug)).toEqual(["dsa", "regular-price"]);
    expect(body.members).toContainEqual({ memberId: "g1", cohort: "regular-price", outcome: "sent" });
    expect(JSON.stringify(body)).not.toContain("example.test");
  });

  it("skips the regular-price run when limited to one cohort", async () => {
    await POST(req({ cohort: "dsa" }));
    expect(mockGifted).not.toHaveBeenCalled();
  });
});
