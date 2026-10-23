import { describe, it, expect, vi, beforeEach } from "vitest";

// sendContinueOffers is tested against a small fake database. What matters here
// is the double-send guard: a member is claimed (continue_offer_sent_at set)
// BEFORE the email goes out, the claim is released if the send fails, and a
// member someone else already claimed is skipped.
const { mockSendEmail, mockLoadOffer } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockLoadOffer: vi.fn(),
}));
vi.mock("@/lib/emails/continue-cohort", () => ({ sendCohortContinueEmail: mockSendEmail }));
vi.mock("@/lib/continue-offer-pricing", () => ({ loadContinueOffer: mockLoadOffer }));
vi.mock("@/lib/tokens", () => ({ generateContinueToken: (id: string, plan: string) => `tok-${id}-${plan}` }));

import { sendContinueOffers } from "@/lib/continue-offer-send";

type Member = { id: string; email: string; first_name: string | null };

function makeDb(opts: {
  cohorts?: { slug: string; name: string; continue_promo_code_id: string }[];
  members?: Member[];
  alreadyClaimed?: string[];
  perks?: { status: string; estimated_savings: number | null; frequency: string | null }[];
  perksError?: boolean;
  events: string[];
}) {
  const cohorts = opts.cohorts ?? [{ slug: "dsa", name: "Dutch Speaking Academy", continue_promo_code_id: "promo_1" }];
  const members = opts.members ?? [];
  const alreadyClaimed = new Set(opts.alreadyClaimed ?? []);
  const log = { memberQueries: 0 };

  const db = {
    from(table: string) {
      let op: "select" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (table === "cohorts") return { data: cohorts, error: null };
        if (table === "perks_partners") {
          return opts.perksError ? { data: null, error: { message: "boom" } } : { data: opts.perks ?? [], error: null };
        }
        if (op === "select") {
          log.memberQueries++;
          return { data: members, error: null };
        }
        const id = filters.id as string;
        if (payload.continue_offer_sent_at === null) {
          opts.events.push(`release:${id}`);
          return { data: null, error: null };
        }
        if (alreadyClaimed.has(id)) return { data: [], error: null };
        alreadyClaimed.add(id);
        opts.events.push(`claim:${id}`);
        return { data: [{ id }], error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        update: (p: Record<string, unknown>) => {
          op = "update";
          payload = p;
          return b;
        },
        not: () => b,
        or: () => b,
        in: () => b,
        lte: () => b,
        is: () => b,
        eq: (col: string, value: unknown) => {
          filters[col] = value;
          return b;
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return b;
    },
  };
  return { db, log };
}

const OFFER = { discountText: "€4 off", durationNote: "", plans: [] };
const robin: Member = { id: "m1", email: "robin@example.test", first_name: "Robin" };
const sam: Member = { id: "m2", email: "sam@example.test", first_name: null };

const run = (db: unknown, extra: Record<string, unknown> = {}) =>
  sendContinueOffers(db as never, { stripe: {} as never, siteUrl: "https://site.test", dryRun: false, ...extra });

describe("sendContinueOffers", () => {
  let events: string[];
  beforeEach(() => {
    events = [];
    mockSendEmail.mockReset();
    mockSendEmail.mockImplementation(async (email: string) => {
      events.push(`send:${email}`);
    });
    mockLoadOffer.mockReset();
    mockLoadOffer.mockResolvedValue(OFFER);
  });

  it("claims each member before emailing them", async () => {
    const { db } = makeDb({ members: [robin, sam], events });
    const [result] = await run(db);
    expect(events).toEqual([
      "claim:m1",
      "send:robin@example.test",
      "claim:m2",
      "send:sam@example.test",
    ]);
    expect(result).toMatchObject({ slug: "dsa", status: "ok", eligible: 2, sent: 2, failed: 0 });
  });

  it("sends the member's name, the cohort name, two signed links and the offer", async () => {
    const { db } = makeDb({ members: [sam], events });
    await run(db);
    const args = mockSendEmail.mock.calls[0];
    expect(args[0]).toBe("sam@example.test");
    expect(args[1]).toBe("there");
    expect(args[2]).toBe("Dutch Speaking Academy");
    expect(args[3]).toBe("https://site.test/api/continue?member_id=m2&plan=standard_monthly&token=tok-m2-standard_monthly");
    expect(args[4]).toBe("https://site.test/api/continue?member_id=m2&plan=commitment_3mo&token=tok-m2-commitment_3mo");
    expect(args[5]).toBe(OFFER);
  });

  it("passes the live Post Perks total to the email", async () => {
    const perks = [
      { status: "published", estimated_savings: 15, frequency: "monthly" },
      { status: "published", estimated_savings: 83, frequency: "once" },
      { status: "published", estimated_savings: null, frequency: "monthly" },
      { status: "coming_soon", estimated_savings: 500, frequency: "monthly" },
    ];
    const { db } = makeDb({ members: [robin], perks, events });
    await run(db);
    expect(mockSendEmail.mock.calls[0][6]).toBe(98);
  });

  it("still sends, without a figure, when the perks total can't be loaded or is zero", async () => {
    const { db } = makeDb({ members: [robin], perksError: true, events });
    const [result] = await run(db);
    expect(result.sent).toBe(1);
    expect(mockSendEmail.mock.calls[0][6]).toBeNull();

    mockSendEmail.mockClear();
    const { db: db2 } = makeDb({ members: [sam], perks: [], events });
    await run(db2);
    expect(mockSendEmail.mock.calls[0][6]).toBeNull();
  });

  it("a dry run claims and sends nothing", async () => {
    const { db } = makeDb({ members: [robin, sam], events });
    const [result] = await run(db, { dryRun: true });
    expect(events).toEqual([]);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.members.map((m) => m.outcome)).toEqual(["would_send", "would_send"]);
    expect(result.sent).toBe(0);
  });

  it("releases the claim when the send fails, and carries on with the next member", async () => {
    mockSendEmail.mockImplementationOnce(async () => {
      throw new Error("resend down");
    });
    const { db } = makeDb({ members: [robin, sam], events });
    const [result] = await run(db);
    expect(events).toEqual(["claim:m1", "release:m1", "claim:m2", "send:sam@example.test"]);
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(result.members.map((m) => m.outcome)).toEqual(["failed", "sent"]);
  });

  it("skips a member someone else already claimed, without sending", async () => {
    const { db } = makeDb({ members: [robin], alreadyClaimed: ["m1"], events });
    const [result] = await run(db);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result.members[0].outcome).toBe("skipped_already_claimed");
    expect(result.sent).toBe(0);
  });

  it("does nothing for a cohort whose promotion code is unusable", async () => {
    mockLoadOffer.mockResolvedValue(null);
    const { db, log } = makeDb({ members: [robin], events });
    const [result] = await run(db);
    expect(result.status).toBe("offer_unavailable");
    expect(log.memberQueries).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("treats a Stripe error while loading the offer like an unusable code", async () => {
    mockLoadOffer.mockRejectedValue(new Error("stripe down"));
    const { db } = makeDb({ members: [robin], events });
    const [result] = await run(db);
    expect(result.status).toBe("offer_unavailable");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("reports nothing to send when no member is eligible", async () => {
    const { db } = makeDb({ members: [], events });
    const [result] = await run(db);
    expect(result).toMatchObject({ status: "ok", eligible: 0, sent: 0, failed: 0 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns no results when no cohort has an offer", async () => {
    const { db } = makeDb({ cohorts: [], members: [robin], events });
    expect(await run(db)).toEqual([]);
  });
});
