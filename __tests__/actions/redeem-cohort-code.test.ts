import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { redeemCohortCode } from "@/app/actions/redeem-cohort-code";

// The "token" passed to the action IS the member id in these tests; the real
// token-to-member check is covered in profile.test.ts.
vi.mock("@/lib/require-member", () => ({
  requireMember: (token: string) =>
    Promise.resolve(token ? { memberId: token, email: `${token}@test.com` } : null),
}));

vi.mock("@/lib/emails", () => ({ sendCohortExistingMemberEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/member-welcome", () => ({
  createWelcomeSignIn: vi.fn().mockResolvedValue({ signInLink: "https://example.test/link", windowOpen: false }),
}));

const SLUG = "test-redeem";
const CODE = "Redeem-Test-Code";

describe("redeemCohortCode — integration", () => {
  const memberIds: string[] = [];

  async function seed(overrides: Parameters<typeof seedMember>[0] = {}) {
    const member = await seedMember(overrides);
    memberIds.push(member.id);
    return member;
  }

  async function setCohort(fields: Record<string, unknown> = {}) {
    const supabase = createTestSupabase();
    await supabase.from("cohorts").delete().eq("slug", SLUG);
    const { error } = await supabase.from("cohorts").insert({
      slug: SLUG,
      name: "Test Academy",
      signup_code: CODE.toLowerCase(),
      grant_matches: 1,
      ...fields,
    });
    if (error) throw new Error(`cohort insert failed: ${error.message}`);
  }

  beforeEach(async () => {
    await setCohort();
  });

  afterEach(async () => {
    for (const id of memberIds.splice(0)) await cleanupMember(id);
    await createTestSupabase().from("cohorts").delete().eq("slug", SLUG);
  });

  it("tags the member with the cohort and grants the free match (code is case-insensitive)", async () => {
    const member = await seed({ matches_remaining: 1 });

    const result = await redeemCohortCode(member.id, `  ${CODE.toUpperCase()} `);
    expect(result).toEqual({ ok: true, cohortName: "Test Academy", matchesGranted: 1 });

    const { data } = await createTestSupabase()
      .from("members")
      .select("cohort, cohort_joined_at, matches_remaining, billing_mode")
      .eq("id", member.id)
      .single();
    expect(data?.cohort).toBe(SLUG);
    expect(data?.cohort_joined_at).toBeTruthy();
    expect(data?.matches_remaining).toBe(2);
    expect(data?.billing_mode).toBe("subscription");
  });

  it("rejects a wrong code and changes nothing", async () => {
    const member = await seed({ matches_remaining: 1 });

    const result = await redeemCohortCode(member.id, "nope");
    expect(result).toHaveProperty("error");

    const { data } = await createTestSupabase()
      .from("members")
      .select("cohort, matches_remaining")
      .eq("id", member.id)
      .single();
    expect(data?.cohort).toBeNull();
    expect(data?.matches_remaining).toBe(1);
  });

  it("refuses a second redemption", async () => {
    const member = await seed({ matches_remaining: 1 });

    expect(await redeemCohortCode(member.id, CODE)).toHaveProperty("ok", true);
    expect(await redeemCohortCode(member.id, CODE)).toHaveProperty("error");

    const { data } = await createTestSupabase().from("members").select("matches_remaining").eq("id", member.id).single();
    expect(data?.matches_remaining).toBe(2);
  });

  it("refuses comped members and inactive members", async () => {
    const comped = await seed({ billing_mode: "comped_no_perks" });
    const inactive = await seed({ status: "inactive" });

    expect(await redeemCohortCode(comped.id, CODE)).toHaveProperty("error");
    expect(await redeemCohortCode(inactive.id, CODE)).toHaveProperty("error");
  });

  it("refuses an inactive cohort's code and a full cohort", async () => {
    const member = await seed({ matches_remaining: 1 });

    await setCohort({ active: false });
    expect(await redeemCohortCode(member.id, CODE)).toHaveProperty("error");

    await setCohort({ signup_cap: 1 });
    const holder = await seed({ cohort: SLUG });
    expect(holder.id).toBeTruthy();
    expect(await redeemCohortCode(member.id, CODE)).toHaveProperty("error");
  });
});
