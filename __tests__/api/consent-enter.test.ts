import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { generateConsentToken } from "@/lib/tokens";

const update = vi.fn();
const isNull = vi.fn();
let member: { email: string } | null = { email: "gift@example.test" };

vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member }) }) }),
      update: (values: unknown) => {
        update(values);
        return { eq: () => ({ is: (...args: unknown[]) => { isNull(...args); return Promise.resolve({}); } }) };
      },
    }),
  }),
}));

const createWelcomeSignIn = vi.fn();
vi.mock("@/lib/member-welcome", () => ({ createWelcomeSignIn: (...a: unknown[]) => createWelcomeSignIn(...a) }));

import { GET } from "@/app/api/consent/enter/route";

function request(memberId: string | null, token: string | null) {
  const url = new URL("http://localhost/api/consent/enter");
  if (memberId) url.searchParams.set("member_id", memberId);
  if (token) url.searchParams.set("token", token);
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/consent/enter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    member = { email: "gift@example.test" };
    createWelcomeSignIn.mockResolvedValue({ signInLink: "https://auth.test/verify?token=abc", windowOpen: false });
  });

  it("stamps consent once, then redirects to a fresh sign-in link for /profile", async () => {
    const res = await GET(request("m1", generateConsentToken("m1")));
    expect(res.headers.get("location")).toBe("https://auth.test/verify?token=abc");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ guidelines_accepted_at: expect.any(String), eligibility_confirmed_at: expect.any(String) })
    );
    expect(isNull).toHaveBeenCalledWith("guidelines_accepted_at", null); // never overwrites an earlier acceptance
    expect(createWelcomeSignIn).toHaveBeenCalledWith(expect.anything(), "gift@example.test", { path: "/profile" });
  });

  it("rejects a token for a different member without touching anything", async () => {
    const res = await GET(request("m1", generateConsentToken("m2")));
    expect(res.headers.get("location")).toContain("/consent/confirmed?invalid=1");
    expect(update).not.toHaveBeenCalled();
    expect(createWelcomeSignIn).not.toHaveBeenCalled();
  });

  it("rejects missing params", async () => {
    const res = await GET(request(null, null));
    expect(res.headers.get("location")).toContain("invalid=1");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an unknown member", async () => {
    member = null;
    const res = await GET(request("m1", generateConsentToken("m1")));
    expect(res.headers.get("location")).toContain("invalid=1");
    expect(update).not.toHaveBeenCalled();
  });
});
