import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  checkPartnerExists,
  getPartnerProfile,
  savePartnerProfile,
  savePartnerContact,
  upsertPartnerLocation,
  deletePartnerLocation,
} from "@/app/actions/partners";
import {
  createTestSupabase,
  seedPartner,
  cleanupPartner,
  seedPartnerLocation,
  getAccessTokenForEmail,
  cleanupAuthUser,
} from "@tests/helpers";

// ---------------------------------------------------------------------------
// Mocks — geocoding is a real Nominatim network call; deterministic here.
// ---------------------------------------------------------------------------

const { mockGeocodeAddress } = vi.hoisted(() => ({
  mockGeocodeAddress: vi.fn(),
}));

vi.mock("@/lib/geocode", () => ({
  geocodeAddress: mockGeocodeAddress,
}));

beforeEach(() => {
  mockGeocodeAddress.mockReset();
  mockGeocodeAddress.mockResolvedValue({ latitude: 52.37, longitude: 4.89, area: "West", neighborhood: "Jordaan" });
});

describe("checkPartnerExists", () => {
  let partnerId: string | undefined;

  afterEach(async () => {
    await cleanupPartner(partnerId);
    partnerId = undefined;
  });

  it("is true for an existing partner's email, case-insensitively", async () => {
    const partner = await seedPartner();
    partnerId = partner.id;
    expect(await checkPartnerExists(partner.email!.toUpperCase())).toBe(true);
  });

  it("is false for an email with no partner row", async () => {
    expect(await checkPartnerExists("nobody-here@example.com")).toBe(false);
  });
});

// Each nested describe below seeds its own partner + access token once via
// beforeAll (not a shared outer beforeEach) — getAccessTokenForEmail hits
// Supabase's real magic-link rate limit when the full suite fires enough
// of these in quick succession, so tests that don't need isolation from
// their siblings share one token instead of minting a fresh one per test.
// savePartnerContact's email-changing test is why this is scoped per
// nested describe rather than to the whole file: it mutates partners.email
// permanently, so it must be the last test to touch its describe's shared
// token, never a describe that outlives it.

describe("authenticated partner profile actions", () => {
  describe("getPartnerProfile", () => {
    let partner: Awaited<ReturnType<typeof seedPartner>>;
    let accessToken: string;

    beforeAll(async () => {
      partner = await seedPartner();
      accessToken = await getAccessTokenForEmail(partner.email!);
    });

    afterAll(async () => {
      await cleanupPartner(partner.id);
      await cleanupAuthUser(partner.email!);
    });

    it("returns null for an invalid access token", async () => {
      expect(await getPartnerProfile("not-a-real-token")).toBeNull();
    });

    it("returns the partner's profile with their locations", async () => {
      await seedPartnerLocation(partner.id, { label: "Center studio" });

      const profile = await getPartnerProfile(accessToken);
      expect(profile?.id).toBe(partner.id);
      expect(profile?.business_name).toBe(partner.business_name);
      expect(profile?.locations).toHaveLength(1);
      expect(profile?.locations[0].label).toBe("Center studio");
    });
  });

  describe("savePartnerProfile", () => {
    let partner: Awaited<ReturnType<typeof seedPartner>>;
    let accessToken: string;

    beforeAll(async () => {
      partner = await seedPartner();
      accessToken = await getAccessTokenForEmail(partner.email!);
    });

    afterAll(async () => {
      await cleanupPartner(partner.id);
      await cleanupAuthUser(partner.email!);
    });

    it("rejects an invalid access token", async () => {
      const result = await savePartnerProfile("not-a-real-token", {
        business_name: "Nope",
        url: "",
        description: "",
        image_url: "",
      });
      expect(result.success).toBe(false);
    });

    it("updates business fields, turning blank strings into null", async () => {
      const result = await savePartnerProfile(accessToken, {
        business_name: "Renamed Business",
        url: "",
        description: "A cozy neighborhood spot",
        image_url: "",
      });
      expect(result.success).toBe(true);

      const profile = await getPartnerProfile(accessToken);
      expect(profile?.business_name).toBe("Renamed Business");
      expect(profile?.url).toBeNull();
      expect(profile?.description).toBe("A cozy neighborhood spot");
    });
  });

  describe("savePartnerContact", () => {
    let partner: Awaited<ReturnType<typeof seedPartner>>;
    let accessToken: string;

    beforeAll(async () => {
      partner = await seedPartner();
      accessToken = await getAccessTokenForEmail(partner.email!);
    });

    afterAll(async () => {
      await cleanupPartner(partner.id);
      await cleanupAuthUser(partner.email!);
    });

    it("rejects a missing required field", async () => {
      const result = await savePartnerContact(accessToken, {
        first_name: "",
        last_name: "Siega",
        email: partner.email!,
      });
      expect(result.success).toBe(false);
    });

    it("rejects changing email to one already used by another partner", async () => {
      const other = await seedPartner();
      try {
        const result = await savePartnerContact(accessToken, {
          first_name: "Alex",
          last_name: "Siega",
          email: other.email!,
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/already associated/i);
      } finally {
        await cleanupPartner(other.id);
      }
    });

    // Must stay last in this describe: it permanently changes partners.email
    // (not the underlying auth user's email, so accessToken itself keeps
    // working — see requirePartner — but a later test relying on
    // partner.email matching the row would break).
    it("updates first/last name and email when there's no conflict", async () => {
      const newEmail = `amsterdamparentproject+partner-${crypto.randomUUID().slice(0, 8)}@gmail.com`;
      const result = await savePartnerContact(accessToken, {
        first_name: "New",
        last_name: "Name",
        email: newEmail,
      });
      expect(result.success).toBe(true);

      const supabase = createTestSupabase();
      const { data } = await supabase.from("partners").select("first_name, last_name, email").eq("id", partner.id).single();
      expect(data?.first_name).toBe("New");
      expect(data?.last_name).toBe("Name");
      expect(data?.email).toBe(newEmail);
    });
  });

  describe("upsertPartnerLocation", () => {
    let partner: Awaited<ReturnType<typeof seedPartner>>;
    let accessToken: string;

    beforeAll(async () => {
      partner = await seedPartner();
      accessToken = await getAccessTokenForEmail(partner.email!);
    });

    afterAll(async () => {
      await cleanupPartner(partner.id);
      await cleanupAuthUser(partner.email!);
    });

    it("rejects an invalid access token", async () => {
      const result = await upsertPartnerLocation("not-a-real-token", { label: "", address: "Somestraat 1" });
      expect(result.success).toBe(false);
    });

    it("creates a location, geocoding the address server-side", async () => {
      const result = await upsertPartnerLocation(accessToken, {
        label: "Center studio",
        address: "Prinsengracht 1, Amsterdam",
      });
      expect(result.success).toBe(true);
      expect(mockGeocodeAddress).toHaveBeenCalledWith("Prinsengracht 1, Amsterdam");
      expect(result.location?.area).toBe("West");
      expect(result.location?.address).toBe("Prinsengracht 1, Amsterdam");
    });

    it("updates an existing location it owns", async () => {
      const loc = await seedPartnerLocation(partner.id, { label: "Old label" });

      const result = await upsertPartnerLocation(accessToken, {
        id: loc.id,
        label: "New label",
        address: "Prinsengracht 1, Amsterdam",
      });
      expect(result.success).toBe(true);
      expect(result.location?.id).toBe(loc.id);
      expect(result.location?.label).toBe("New label");
    });

    it("refuses to update a location owned by a different partner", async () => {
      const other = await seedPartner();
      try {
        const otherLoc = await seedPartnerLocation(other.id);

        const result = await upsertPartnerLocation(accessToken, {
          id: otherLoc.id,
          label: "Hijacked",
          address: "Somewhere Else 1",
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found/i);

        const supabase = createTestSupabase();
        const { data } = await supabase.from("partner_locations").select("label").eq("id", otherLoc.id).single();
        expect(data?.label).not.toBe("Hijacked");
      } finally {
        await cleanupPartner(other.id);
      }
    });
  });

  describe("deletePartnerLocation", () => {
    let partner: Awaited<ReturnType<typeof seedPartner>>;
    let accessToken: string;

    beforeAll(async () => {
      partner = await seedPartner();
      accessToken = await getAccessTokenForEmail(partner.email!);
    });

    afterAll(async () => {
      await cleanupPartner(partner.id);
      await cleanupAuthUser(partner.email!);
    });

    it("deletes a location it owns", async () => {
      const loc = await seedPartnerLocation(partner.id);

      const result = await deletePartnerLocation(accessToken, loc.id);
      expect(result.success).toBe(true);

      const supabase = createTestSupabase();
      const { data } = await supabase.from("partner_locations").select("id").eq("id", loc.id).maybeSingle();
      expect(data).toBeNull();
    });

    it("does not delete a location owned by a different partner, even though the call reports success", async () => {
      const other = await seedPartner();
      try {
        const otherLoc = await seedPartnerLocation(other.id);

        // The ownership check is baked into the delete's WHERE clause, not
        // a separate lookup — deleting zero rows isn't a Postgres error, so
        // this "succeeds" without actually deleting anything. That's the
        // real security boundary; asserted directly here.
        const result = await deletePartnerLocation(accessToken, otherLoc.id);
        expect(result.success).toBe(true);

        const supabase = createTestSupabase();
        const { data } = await supabase.from("partner_locations").select("id").eq("id", otherLoc.id).maybeSingle();
        expect(data).not.toBeNull();
      } finally {
        await cleanupPartner(other.id);
      }
    });
  });
});
