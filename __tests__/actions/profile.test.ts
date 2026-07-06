import { describe, it, expect, vi, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { updateMemberProfile, getMemberProfile, checkMemberExists } from "@/app/actions/profile";
import type { Availability, Child } from "@/app/actions/profile";

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: { update: vi.fn().mockResolvedValue({}) },
  }),
}));

vi.mock("@/lib/matcher", () => ({
  geocodeZipcode: vi.fn().mockResolvedValue({ lat: 52.374, lng: 4.89 }),
}));

describe("email case-insensitivity", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("getMemberProfile finds a member regardless of input casing", async () => {
    const member = await seedMember();
    memberId = member.id;

    const result = await getMemberProfile(member.email.toUpperCase());
    expect(result).not.toBeNull();
    expect(result?.id).toBe(memberId);
  });

  it("checkMemberExists returns true regardless of input casing", async () => {
    const member = await seedMember();
    memberId = member.id;

    expect(await checkMemberExists(member.email.toUpperCase())).toBe(true);
    expect(await checkMemberExists(
      member.email.slice(0, 5).toUpperCase() + member.email.slice(5)
    )).toBe(true);
  });
});

describe("profile — geocoding on save", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("writes lat/lng after a zipcode is saved", async () => {
    const member = await seedMember();
    memberId = member.id;

    await updateMemberProfile(memberId, member.email, { zipcode: "1012AB" });

    const supabase = createTestSupabase();
    await vi.waitFor(async () => {
      const { data } = await supabase
        .from("members")
        .select("lat, lng")
        .eq("id", memberId)
        .single();
      expect(data?.lat).toBeCloseTo(52.374);
      expect(data?.lng).toBeCloseTo(4.89);
    }, { timeout: 3000 });
  });

  it("clears lat/lng when zipcode is set to null", async () => {
    const member = await seedMember({ zipcode: "1012AB" });
    memberId = member.id;

    // Seed existing coords directly
    const supabase = createTestSupabase();
    await supabase.from("members").update({ lat: 52.374, lng: 4.89 }).eq("id", memberId);

    await updateMemberProfile(memberId, member.email, { zipcode: null });

    await vi.waitFor(async () => {
      const { data } = await supabase
        .from("members")
        .select("lat, lng")
        .eq("id", memberId)
        .single();
      expect(data?.lat).toBeNull();
      expect(data?.lng).toBeNull();
    }, { timeout: 3000 });
  });
});

describe("profile — matching fields", () => {
  let memberId: string;
  let memberEmail: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("persists zipcode, children, and availability to the DB", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;

    const newZipcode = "1012AB";
    const newChildren: Child[] = [
      { birth_month: 3, birth_year: 2024, expected: false },
    ];
    const newAvailability: Availability = {
      days: ["monday", "wednesday"],
      times: ["morning"],
    };

    await updateMemberProfile(memberId, memberEmail, {
      zipcode: newZipcode,
      children: newChildren,
      availability: newAvailability,
    });

    const supabase = createTestSupabase();
    const { data } = await supabase
      .from("members")
      .select("zipcode, children, availability")
      .eq("id", memberId)
      .single();

    expect(data?.zipcode).toBe(newZipcode);
    expect(data?.children).toEqual(newChildren);
    expect(data?.availability).toEqual(newAvailability);
  });

  it("getMemberProfile returns the saved matching fields", async () => {
    const member = await seedMember({
      zipcode: "1054GH",
      children: [{ birth_month: 7, birth_year: 2023, expected: false }],
      availability: { days: ["friday"], times: ["afternoon", "evening"] },
    });
    memberId = member.id;
    memberEmail = member.email;

    const profile = await getMemberProfile(memberEmail);

    expect(profile?.zipcode).toBe("1054GH");
    expect(profile?.children).toEqual([
      { birth_month: 7, birth_year: 2023, expected: false },
    ]);
    expect(profile?.availability).toEqual({
      days: ["friday"],
      times: ["afternoon", "evening"],
    });
  });
});
