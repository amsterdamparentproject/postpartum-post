import { describe, it, expect, afterEach, vi } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { resumeMembership } from "@/app/actions/resume-membership";

// The "token" passed to an action IS the member id in these tests;
// requireMember's real token→member verification is covered in profile.test.ts.
vi.mock("@/lib/require-member", () => ({
  requireMember: (token: string) =>
    Promise.resolve(token ? { memberId: token, email: `${token}@test.com` } : null),
}));

async function memberRow(memberId: string) {
  const { data } = await createTestSupabase()
    .from("members")
    .select("status, matches_remaining")
    .eq("id", memberId)
    .single();
  return data;
}

describe("resumeMembership", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("puts a canceling member with a live subscription back to active, keeping their rounds", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });

    expect(await resumeMembership(memberId)).toEqual({ ok: true });
    expect(await memberRow(memberId)).toEqual({ status: "active", matches_remaining: 2 });
  });

  it("clears the cancel date", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });
    await createTestSupabase().from("members").update({ canceled_at: new Date().toISOString() }).eq("id", memberId);

    await resumeMembership(memberId);
    const { data } = await createTestSupabase().from("members").select("canceled_at").eq("id", memberId).single();
    expect(data?.canceled_at).toBeNull();
  });

  it("works for a canceling member who has used up their rounds but is still waiting on renew-check", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 0 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });

    expect(await resumeMembership(memberId)).toEqual({ ok: true });
    expect(await memberRow(memberId)).toEqual({ status: "active", matches_remaining: 0 });
  });

  it("refuses when no live subscription is left, so it can't lead to a second one", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "canceled" });

    expect(await resumeMembership(memberId)).toEqual({ ok: false, reason: "no_live_subscription" });
    expect(await memberRow(memberId)).toEqual({ status: "canceling", matches_remaining: 2 });
  });

  it("is safe to call twice", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 1 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });

    await resumeMembership(memberId);
    expect(await resumeMembership(memberId)).toEqual({ ok: true });
  });

  it("refuses an inactive member and changes nothing", async () => {
    const member = await seedMember({ status: "inactive", matches_remaining: 0 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "canceled" });

    expect(await resumeMembership(memberId)).toEqual({ ok: false, reason: "not_canceling" });
    expect(await memberRow(memberId)).toEqual({ status: "inactive", matches_remaining: 0 });
  });

  it("rejects calls without a valid session", async () => {
    expect(await resumeMembership("")).toEqual({ ok: false, reason: "not_authenticated" });
  });
});
