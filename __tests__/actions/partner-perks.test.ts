import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { savePartnerPerk, listPartnerPerks, type PartnerPerkInput } from "@/app/actions/partners";
import { listPerksForReview, setPerkStatus, addPerkForPartner, updatePerkAdmin } from "@/app/admin/partners/actions";
import {
  seedPartner,
  cleanupPartner,
  seedPartnerLocation,
  getAccessTokenForEmail,
  cleanupAuthUser,
  getPerkRaw,
  getPerkLocationIds,
} from "@tests/helpers";

// ---------------------------------------------------------------------------
// Mocks — publishing a perk emails its partner (lib/emails/perk-live.ts);
// never send a real one from tests.
// ---------------------------------------------------------------------------

const { mockSendPerkLiveEmail } = vi.hoisted(() => ({
  mockSendPerkLiveEmail: vi.fn(),
}));

vi.mock("@/lib/emails/perk-live", () => ({
  sendPerkLiveEmail: mockSendPerkLiveEmail,
}));

beforeEach(() => {
  mockSendPerkLiveEmail.mockReset();
  mockSendPerkLiveEmail.mockResolvedValue(undefined);
});

function perkInput(overrides: Partial<PartnerPerkInput> = {}): PartnerPerkInput {
  return {
    location_ids: [],
    is_online: false,
    title: "20% off your first visit",
    description: "A discount for Postpartum Post members",
    redemption_type: "code",
    redemption_code: "POSTPARTUMPOST20",
    url: "",
    expires_at: "",
    exclusive: false,
    frequency: "monthly",
    ...overrides,
  };
}

// Each describe below seeds its partner + access token once via beforeAll,
// not a per-test beforeEach — getAccessTokenForEmail hits Supabase's real
// magic-link rate limit when the full suite fires enough of these in quick
// succession. None of the tests within a describe depend on a completely
// fresh partner (they assert on specific perk ids, not on the partner's
// total perk count), so sharing is safe; a test that genuinely needs a
// second, isolated partner (cross-partner ownership checks) still seeds
// its own "other" partner + token inline.

describe("savePartnerPerk", () => {
  let partner: Awaited<ReturnType<typeof seedPartner>>;
  let accessToken: string;

  beforeAll(async () => {
    partner = await seedPartner();
    accessToken = await getAccessTokenForEmail(partner.email!);
  });

  afterAll(async () => {
    await cleanupPartner(partner.id); // cascades to the partner's perks/locations
    await cleanupAuthUser(partner.email!);
  });

  it("rejects an invalid access token", async () => {
    const result = await savePartnerPerk("not-a-real-token", perkInput());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not signed in/i);
  });

  // Field rules themselves are unit-tested in __tests__/lib/perk-input.test.ts;
  // this just confirms the action runs them before touching the DB.
  it("rejects invalid fields (normalizePerkInput)", async () => {
    expect((await savePartnerPerk(accessToken, perkInput({ title: "" }))).success).toBe(false);
    expect((await savePartnerPerk(accessToken, perkInput({ redemption_code: "" }))).success).toBe(false);
  });

  it("drops a stale code when the type isn't Code, and keeps the link for any type", async () => {
    const result = await savePartnerPerk(
      accessToken,
      perkInput({ redemption_type: "online", redemption_code: "STALE", url: "https://example.com/offer" }),
    );
    const raw = await getPerkRaw(result.perkId!);
    expect(raw?.redemption_type).toBe("online");
    expect(raw?.url).toBe("https://example.com/offer");
    expect(raw?.redemption_code).toBeNull();
  });

  it("saves an in-person perk with a learn-more link", async () => {
    const result = await savePartnerPerk(
      accessToken,
      perkInput({ redemption_type: "in_person", redemption_code: "", url: "https://example.com/cafe" }),
    );
    expect(result.success).toBe(true);
    expect((await getPerkRaw(result.perkId!))?.url).toBe("https://example.com/cafe");
  });

  it("saves an in-person perk with no code or link", async () => {
    const result = await savePartnerPerk(
      accessToken,
      perkInput({ redemption_type: "in_person", redemption_code: "" }),
    );
    expect(result.success).toBe(true);
    const raw = await getPerkRaw(result.perkId!);
    expect(raw?.redemption_type).toBe("in_person");
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

  it("sends an already-published perk back to 'pending' when the partner edits it", async () => {
    const created = await savePartnerPerk(accessToken, perkInput());
    await setPerkStatus(created.perkId!, "published");
    expect((await getPerkRaw(created.perkId!))?.status).toBe("published");

    await savePartnerPerk(accessToken, perkInput({ id: created.perkId, title: "Updated title" }));

    const raw = await getPerkRaw(created.perkId!);
    expect(raw?.status).toBe("pending");
    expect(raw?.title).toBe("Updated title");
  });

  it("refuses to update a perk owned by a different partner", async () => {
    const other = await seedPartner();
    try {
      const othersPerk = await savePartnerPerk(await getAccessTokenForEmail(other.email!), perkInput());

      const result = await savePartnerPerk(accessToken, perkInput({ id: othersPerk.perkId, title: "Hijacked" }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);

      const raw = await getPerkRaw(othersPerk.perkId!);
      expect(raw?.title).not.toBe("Hijacked");
    } finally {
      await cleanupAuthUser(other.email!);
      await cleanupPartner(other.id);
    }
  });

  it("refuses a location that belongs to a different partner", async () => {
    const other = await seedPartner();
    try {
      const othersLocation = await seedPartnerLocation(other.id);

      const result = await savePartnerPerk(accessToken, perkInput({ location_ids: [othersLocation.id] }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/location not found/i);
    } finally {
      await cleanupPartner(other.id);
    }
  });
});

describe("perk locations (optional, multiple)", () => {
  it("saves with no locations, even when the partner has one", async () => {
    const partner = await seedPartner();
    try {
      await seedPartnerLocation(partner.id);
      const result = await addPerkForPartner({ ...perkInput(), partner_id: partner.id, status: "pending" });
      expect(result.success).toBe(true);
      expect(await getPerkLocationIds(result.perkId!)).toEqual([]);
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("saves a single picked location that belongs to the partner", async () => {
    const partner = await seedPartner();
    try {
      await seedPartnerLocation(partner.id, { label: "West" });
      const east = await seedPartnerLocation(partner.id, { label: "East" });
      const result = await addPerkForPartner({
        ...perkInput({ location_ids: [east.id] }),
        partner_id: partner.id,
        status: "pending",
      });
      expect(await getPerkLocationIds(result.perkId!)).toEqual([east.id]);
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("saves several locations that belong to the partner", async () => {
    const partner = await seedPartner();
    try {
      const west = await seedPartnerLocation(partner.id, { label: "West" });
      const east = await seedPartnerLocation(partner.id, { label: "East" });
      const result = await addPerkForPartner({
        ...perkInput({ location_ids: [west.id, east.id] }),
        partner_id: partner.id,
        status: "pending",
      });
      expect(new Set(await getPerkLocationIds(result.perkId!))).toEqual(new Set([west.id, east.id]));
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("updating a perk's locations replaces the old set, not adds to it", async () => {
    const partner = await seedPartner();
    try {
      const west = await seedPartnerLocation(partner.id, { label: "West" });
      const east = await seedPartnerLocation(partner.id, { label: "East" });
      const created = await addPerkForPartner({
        ...perkInput({ location_ids: [west.id] }),
        partner_id: partner.id,
        status: "pending",
      });

      await updatePerkAdmin({
        ...perkInput({ location_ids: [east.id] }),
        perkId: created.perkId!,
        status: "pending",
      });

      expect(await getPerkLocationIds(created.perkId!)).toEqual([east.id]);
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("can be both online and tied to a location at once", async () => {
    const partner = await seedPartner();
    try {
      const west = await seedPartnerLocation(partner.id, { label: "West" });
      const result = await addPerkForPartner({
        ...perkInput({ is_online: true, location_ids: [west.id] }),
        partner_id: partner.id,
        status: "pending",
      });
      expect(result.success).toBe(true);
      expect((await getPerkRaw(result.perkId!))?.is_online).toBe(true);
      expect(await getPerkLocationIds(result.perkId!)).toEqual([west.id]);
    } finally {
      await cleanupPartner(partner.id);
    }
  });
});

describe("admin perk writes (addPerkForPartner / updatePerkAdmin)", () => {
  it("adds a perk with source 'manual' and the chosen status, and edits it without re-queuing", async () => {
    const partner = await seedPartner();
    try {
      const created = await addPerkForPartner({ ...perkInput(), partner_id: partner.id, status: "published" });
      expect(created.success).toBe(true);
      let raw = await getPerkRaw(created.perkId!);
      expect(raw?.source).toBe("manual");
      expect(raw?.status).toBe("published");

      const updated = await updatePerkAdmin({
        ...perkInput({ title: "Edited by admin" }),
        perkId: created.perkId!,
        status: "published",
      });
      expect(updated.success).toBe(true);
      raw = await getPerkRaw(created.perkId!);
      expect(raw?.title).toBe("Edited by admin");
      expect(raw?.status).toBe("published");
    } finally {
      await cleanupPartner(partner.id);
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

      await savePartnerPerk(token, perkInput({ title: "Mine" }));
      await savePartnerPerk(otherToken, perkInput({ title: "Not mine" }));

      const perks = await listPartnerPerks(token);
      expect(perks).toHaveLength(1);
      expect(perks[0].title).toBe("Mine");
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

  beforeAll(async () => {
    partner = await seedPartner({ business_name: `Review Test ${crypto.randomUUID().slice(0, 8)}` });
    accessToken = await getAccessTokenForEmail(partner.email!);
  });

  afterAll(async () => {
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

describe("perk-live email (notifyPerkLive)", () => {
  it("emails the partner when setPerkStatus publishes a perk, and not again on a re-publish", async () => {
    const partner = await seedPartner({ first_name: "Robin" });
    try {
      const created = await addPerkForPartner({ ...perkInput({ title: "2 for 1 classes" }), partner_id: partner.id, status: "pending" });
      expect(mockSendPerkLiveEmail).not.toHaveBeenCalled();

      await setPerkStatus(created.perkId!, "published");
      expect(mockSendPerkLiveEmail).toHaveBeenCalledTimes(1);
      expect(mockSendPerkLiveEmail).toHaveBeenCalledWith({
        firstName: "Robin",
        businessName: partner.business_name,
        email: partner.email,
        perkTitle: "2 for 1 classes",
      });

      await setPerkStatus(created.perkId!, "published");
      await updatePerkAdmin({ ...perkInput({ title: "2 for 1 classes" }), perkId: created.perkId!, status: "published" });
      expect(mockSendPerkLiveEmail).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("doesn't email for non-published statuses (including coming_soon)", async () => {
    const partner = await seedPartner();
    try {
      const created = await addPerkForPartner({ ...perkInput(), partner_id: partner.id, status: "coming_soon" });
      await setPerkStatus(created.perkId!, "rejected");
      await updatePerkAdmin({ ...perkInput(), perkId: created.perkId!, status: "archived" });
      expect(mockSendPerkLiveEmail).not.toHaveBeenCalled();
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("emails when updatePerkAdmin or addPerkForPartner publishes", async () => {
    const partner = await seedPartner();
    try {
      const pending = await addPerkForPartner({ ...perkInput(), partner_id: partner.id, status: "pending" });
      await updatePerkAdmin({ ...perkInput(), perkId: pending.perkId!, status: "published" });
      expect(mockSendPerkLiveEmail).toHaveBeenCalledTimes(1);

      await addPerkForPartner({ ...perkInput(), partner_id: partner.id, status: "published" });
      expect(mockSendPerkLiveEmail).toHaveBeenCalledTimes(2);
    } finally {
      await cleanupPartner(partner.id);
    }
  });

  it("skips a partner with no email, and a failed send doesn't fail the status change", async () => {
    const noEmail = await seedPartner({ email: null });
    const partner = await seedPartner();
    try {
      await addPerkForPartner({ ...perkInput(), partner_id: noEmail.id, status: "published" });
      expect(mockSendPerkLiveEmail).not.toHaveBeenCalled();

      mockSendPerkLiveEmail.mockRejectedValueOnce(new Error("resend down"));
      const created = await addPerkForPartner({ ...perkInput(), partner_id: partner.id, status: "pending" });
      const result = await setPerkStatus(created.perkId!, "published");
      expect(result.success).toBe(true);
      expect((await getPerkRaw(created.perkId!))?.status).toBe("published");
    } finally {
      await cleanupPartner(noEmail.id);
      await cleanupPartner(partner.id);
    }
  });
});
