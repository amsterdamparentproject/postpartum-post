import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { listMemberPerks, redeemPerk, viewPerk } from "@/app/(account)/my-perks/actions";
import { addPerkForPartner } from "@/app/admin/partners/actions";
import {
  createTestSupabase,
  seedMember,
  cleanupMember,
  seedPartner,
  cleanupPartner,
  getAccessTokenForEmail,
  cleanupAuthUser,
  seedMonthlyPerks,
} from "@tests/helpers";

// addPerkForPartner(status: "published") emails the partner — never send a
// real one from tests (see partner-perks.test.ts for the behavior itself).
vi.mock("@/lib/emails/perk-live", () => ({
  sendPerkLiveEmail: vi.fn().mockResolvedValue(undefined),
}));

/**
 * The members' Perks tab (app/(account)/my-perks/actions.ts): codes stay
 * hidden until redeemed, one 'redeemed' perk_events row per member, perk
 * and month (a repeat redeem just shows the code again), and only current
 * subscriptions can redeem.
 */
describe("member perks", () => {
  let member: Awaited<ReturnType<typeof seedMember>>;
  let partner: Awaited<ReturnType<typeof seedPartner>>;
  let token: string;
  let perkId: string;

  beforeAll(async () => {
    member = await seedMember();
    // Perks access is gated on having opted into something this month
    // (see lib/monthly-opt-in.ts) -- these tests are about redemption
    // itself, so give the member perks-only access rather than a real
    // match opt-in.
    await seedMonthlyPerks(member.id);
    token = await getAccessTokenForEmail(member.email);
    partner = await seedPartner({ url: "https://example.com" });
    const created = await addPerkForPartner({
      partner_id: partner.id,
      status: "published",
      location_ids: [],
      is_online: false,
      title: "Free babyccino",
      description: "With any coffee.",
      redemption_type: "code",
      redemption_code: "MAMA20",
      url: "",
      expires_at: "",
      exclusive: false,
      frequency: "monthly",
    });
    perkId = created.perkId!;
  });

  afterAll(async () => {
    await cleanupPartner(partner.id); // cascades to perks and their events
    await cleanupAuthUser(member.email);
    await cleanupMember(member.id);
  });

  it("lists live perks without the code until redeemed", async () => {
    const { optedIn, perks } = await listMemberPerks(token);
    expect(optedIn).toBe(true);
    const perk = perks.find((p) => p.id === perkId);
    expect(perk).toBeTruthy();
    expect(perk?.reveal).toBeNull();
    expect(JSON.stringify(perk)).not.toContain("MAMA20");
  });

  it("redeems once per month, and a repeat just shows the same code", async () => {
    const first = await redeemPerk(token, perkId);
    expect(first).toEqual({
      success: true,
      reveal: { redemption_type: "code", code: "MAMA20", url: "https://example.com" },
    });

    const again = await redeemPerk(token, perkId);
    expect(again.success).toBe(true);

    const { data: rows } = await createTestSupabase()
      .from("perk_events")
      .select("id")
      .eq("perk_id", perkId)
      .eq("member_id", member.id)
      .eq("event_type", "redeemed");
    expect(rows).toHaveLength(1);

    const listed = (await listMemberPerks(token)).perks.find((p) => p.id === perkId);
    expect(listed?.reveal?.code).toBe("MAMA20");
  });

  it("logs a 'viewed' event for a signed-in member, and nothing for a bad token", async () => {
    await viewPerk(token, perkId);
    await viewPerk("not-a-real-token", perkId);

    const { data: rows } = await createTestSupabase()
      .from("perk_events")
      .select("member_id")
      .eq("perk_id", perkId)
      .eq("event_type", "viewed");
    expect(rows).toEqual([{ member_id: member.id }]);
  });

  it("refuses an invalid token", async () => {
    expect((await redeemPerk("not-a-real-token", perkId)).success).toBe(false);
  });

  it("refuses a member without a current subscription", async () => {
    const inactive = await seedMember({ status: "inactive" });
    try {
      await seedMonthlyPerks(inactive.id);
      const inactiveToken = await getAccessTokenForEmail(inactive.email);
      const result = await redeemPerk(inactiveToken, perkId);
      expect(result.success).toBe(false);
    } finally {
      await cleanupAuthUser(inactive.email);
      await cleanupMember(inactive.id);
    }
  });

  it("refuses a member who hasn't opted into anything this month", async () => {
    const notOptedIn = await seedMember();
    try {
      const notOptedInToken = await getAccessTokenForEmail(notOptedIn.email);
      const listed = await listMemberPerks(notOptedInToken);
      expect(listed).toEqual({ optedIn: false, perks: [] });

      const result = await redeemPerk(notOptedInToken, perkId);
      expect(result.success).toBe(false);
    } finally {
      await cleanupAuthUser(notOptedIn.email);
      await cleanupMember(notOptedIn.id);
    }
  });
});
