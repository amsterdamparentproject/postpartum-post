import { describe, it, expect, vi, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { updateMemberProfile, getMemberProfile, checkMemberExists } from "@/app/actions/profile";
import type { Availability, Child } from "@/app/actions/profile";

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: { update: vi.fn().mockResolvedValue({}) },
  }),
}));

describe("email case-insensitivity", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("getMemberProfile finds a member regardless of input casing", async () => {
    const member = await seedMember({ email: "test-case@example.com" });
    memberId = member.id;

    const result = await getMemberProfile("TEST-CASE@EXAMPLE.COM");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(memberId);
  });

  it("checkMemberExists returns true regardless of input casing", async () => {
    const member = await seedMember({ email: "test-exists@example.com" });
    memberId = member.id;

    expect(await checkMemberExists("TEST-EXISTS@EXAMPLE.COM")).toBe(true);
    expect(await checkMemberExists("Test-Exists@Example.com")).toBe(true);
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
