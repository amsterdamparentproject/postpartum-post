import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { savePartnerPerk, listPartnerPerks, type PartnerPerkInput } from "@/app/actions/partners";
import { listPerksForReview, setPerkStatus } from "@/app/admin/partners/actions";
import {
  seedPartner,
  cleanupPartner,
  seedPartnerLocation,
  getAccessTokenForEmail,
  cleanupAuthUser,
  getPerkRaw,
  getPerkCategoryLinks,
  getSeededPerkCategoryIds,
} from "@tests/helpers";

function perkInput(overrides: Partial<PartnerPerkInput> = {}): PartnerPerkInput {
  return {
    location_id: null,
    partner_link: "",
    perk_title: "20% off your first visit",
    perk_description: "A discount for Postpartum Post members",
    perk_discount: "20%",
    redemption_instructions: "",
    perk_redemption_code: "",
    perk_redemption_url: "",
    expires_at: "",
    exclusive: false,
    category_ids: [],
    ...overrides,
  };
}

describe("savePartnerPerk", () => {
  let partner: Awaited<ReturnType<typeof seedPartner>>;
  let accessToken: string;

  beforeEach(async () => {
    partner = await seedPartner();
    accessToken = await getAccessTokenForEmail(partner.email!);
  });

  afterEach(async () => {
    await cleanupPartner(partner.id); // cascades to the partner's perks/locations
    await cleanupAuthUser(partner.email!);
  });

  it("rejects an invalid access token", async () => {
    const result = await savePartnerPerk("not-a-real-token", perkInput());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not signed in/i);
  });

  it("rejects a perk missing title, description, or discount", async () => {
    const result = await savePartnerPerk(accessToken, perkInput({ perk_title: "" }));
    expect(result.success).toBe(false);
  });

  it("creates a perk always forced to status 'pending' and source 'partner_portal'", async () => {
    const result = await savePartnerPerk(accessToken, perkInput());
    expect(result.success).toBe(true);
    expect(result.perkId).toBeTruthy();

    const raw = await getPerkRaw(result.perkId!);
    expect(raw?.status).toBe("pending");
    expect(raw?.source).toBe("partner_portal");
    expect(raw?.partner_id).toBe(partner.id);
  });

  it("persists the exclusive flag", async () => {
    const result = await savePartnerPerk(accessToken, perkInput({ exclusive: true }));
    const raw = await getPerkRaw(result.perkId!);
    expect(raw?.exclusive).toBe(true);
  });

  it("links the given categories", async () => {
    const categoryIds = await getSeededPerkCategoryIds(2);
    expect(categoryIds.length).toBeGreaterThan(0);

    const result = await savePartnerPerk(accessToken, perkInput({ category_ids: categoryIds }));
    const links = await getPerkCategoryLinks(result.perkId!);
    expect(links.sort()).toEqual([...categoryIds].sort());
  });

  it("replaces category links on update rather than accumulating them", async () => {
    const [catA, catB] = await getSeededPerkCategoryIds(2);
    const created = await savePartnerPerk(accessToken, perkInput({ category_ids: [catA] }));

    await savePartnerPerk(accessToken, perkInput({ id: created.perkId, category_ids: [catB] }));

    const links = await getPerkCategoryLinks(created.perkId!);
    expect(links).toEqual([catB]);
  });

  it("sends an already-published perk back to 'pending' when the partner edits it", async () => {
    const created = await savePartnerPerk(accessToken, perkInput());
    await setPerkStatus(created.perkId!, "published");
    expect((await getPerkRaw(created.perkId!))?.status).toBe("published");

    await savePartnerPerk(accessToken, perkInput({ id: created.perkId, perk_title: "Updated title" }));

    const raw = await getPerkRaw(created.perkId!);
    expect(raw?.status).toBe("pending");
    expect(raw?.perk_title).toBe("Updated title");
  });

  it("refuses to update a perk owned by a different partner", async () => {
    const other = await seedPartner();
    try {
      const othersPerk = await savePartnerPerk(await getAccessTokenForEmail(other.email!), perkInput());

      const result = await savePartnerPerk(accessToken, perkInput({ id: othersPerk.perkId, perk_title: "Hijacked" }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);

      const raw = await getPerkRaw(othersPerk.perkId!);
      expect(raw?.perk_title).not.toBe("Hijacked");
    } finally {
      await cleanupAuthUser(other.email!);
      await cleanupPartner(other.id);
    }
  });

  it("refuses a location_id that belongs to a different partner", async () => {
    const other = await seedPartner();
    try {
      const othersLocation = await seedPartnerLocation(other.id);

      const result = await savePartnerPerk(accessToken, perkInput({ location_id: othersLocation.id }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/location not found/i);
    } finally {
      await cleanupPartner(other.id);
    }
  });
});

describe("listPartnerPerks", () => {
  it("returns an empty array for an invalid access token", async () => {
    expect(await listPartnerPerks("not-a-real-token")).toEqual([]);
  });

  it("only returns the authenticated partner's own perks", async () => {
    const partner = await seedPartner();
    const other = await seedPartner();
    try {
      const token = await getAccessTokenForEmail(partner.email!);
      const otherToken = await getAccessTokenForEmail(other.email!);

      await savePartnerPerk(token, perkInput({ perk_title: "Mine" }));
      await savePartnerPerk(otherToken, perkInput({ perk_title: "Not mine" }));

      const perks = await listPartnerPerks(token);
      expect(perks).toHaveLength(1);
      expect(perks[0].perk_title).toBe("Mine");
    } finally {
      await cleanupAuthUser(partner.email!);
      await cleanupAuthUser(other.email!);
      await cleanupPartner(partner.id);
      await cleanupPartner(other.id);
    }
  });
});

describe("admin perk review (listPerksForReview / setPerkStatus)", () => {
  let partner: Awaited<ReturnType<typeof seedPartner>>;
  let accessToken: string;

  beforeEach(async () => {
    partner = await seedPartner({ business_name: `Review Test ${crypto.randomUUID().slice(0, 8)}` });
    accessToken = await getAccessTokenForEmail(partner.email!);
  });

  afterEach(async () => {
    await cleanupPartner(partner.id);
    await cleanupAuthUser(partner.email!);
  });

  it("surfaces the partner's business name and exclusive flag via the perks_partners view", async () => {
    const created = await savePartnerPerk(accessToken, perkInput({ exclusive: true }));

    const queue = await listPerksForReview();
    const entry = queue.find((p) => p.id === created.perkId);
    expect(entry).toBeTruthy();
    expect(entry?.partner_name).toBe(partner.business_name);
    expect(entry?.exclusive).toBe(true);
    expect(entry?.status).toBe("pending");
  });

  it("setPerkStatus transitions a perk's status", async () => {
    const created = await savePartnerPerk(accessToken, perkInput());

    const result = await setPerkStatus(created.perkId!, "published");
    expect(result.success).toBe(true);
    expect((await getPerkRaw(created.perkId!))?.status).toBe("published");

    await setPerkStatus(created.perkId!, "archived");
    expect((await getPerkRaw(created.perkId!))?.status).toBe("archived");
  });
});
