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
    token = await getAccessTokenForEmail(member.email);
    partner = await seedPartner({ url: "https://example.com" });
    const created = await addPerkForPartner({
      partner_id: partner.id,
      status: "published",
      location_id: null,
      title: "Free babyccino",
      description: "With any coffee.",
      redemption_type: "code",
      redemption_code: "MAMA20",
      url: "",
      expires_at: "",
      exclusive: false,
    });
    perkId = created.perkId!;
  });

  afterAll(async () => {
    await cleanupPartner(partner.id); // cascades to perks and their events
    await cleanupAuthUser(member.email);
    await cleanupMember(member.id);
  });

  it("lists live perks without the code until redeemed", async () => {
    const perks = await listMemberPerks(token);
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

    const listed = (await listMemberPerks(token)).find((p) => p.id === perkId);
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
      const inactiveToken = await getAccessTokenForEmail(inactive.email);
      const result = await redeemPerk(inactiveToken, perkId);
      expect(result.success).toBe(false);
    } finally {
      await cleanupAuthUser(inactive.email);
      await cleanupMember(inactive.id);
    }
  });
});
