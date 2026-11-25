import { describe, it, expect, afterEach, vi } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { endMembershipNow } from "@/app/actions/end-membership";

// The "token" passed to an action IS the member id in these tests;
// requireMember's real token→member verification is covered in profile.test.ts.
vi.mock("@/lib/require-member", () => ({
  requireMember: (token: string) =>
    Promise.resolve(token ? { memberId: token, email: `${token}@test.com` } : null),
}));

const thisMonth = () =>
  new Date().toISOString().slice(0, 7) + "-01";

async function ledgerRows(memberId: string) {
  const supabase = createTestSupabase();
  const { data } = await supabase
    .from("match_entitlements")
    .select("event, delta")
    .eq("member_id", memberId);
  return data ?? [];
}

async function memberRow(memberId: string) {
  const supabase = createTestSupabase();
  const { data } = await supabase
    .from("members")
    .select("status, matches_remaining")
    .eq("id", memberId)
    .single();
  return data;
}

describe("endMembershipNow", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) {
      const supabase = createTestSupabase();
      await supabase.from("match_entitlements").delete().eq("member_id", memberId);
      await cleanupMember(memberId);
    }
  });

  it("forfeits the remaining rounds and leaves a live subscription for renew-check to finalize", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 3 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });

    const result = await endMembershipNow(memberId);

    expect(result).toEqual({ ok: true, forfeited: 3 });
    expect(await ledgerRows(memberId)).toEqual([{ event: "canceled", delta: -3 }]);
    // Still "canceling": renew-check cancels the subscription at 0, and the
    // deletion webhook then sets "inactive".
    expect(await memberRow(memberId)).toEqual({ status: "canceling", matches_remaining: 0 });
  });

  it("sets the member inactive straight away when no live subscription is left", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "canceled" });

    const result = await endMembershipNow(memberId);

    expect(result).toEqual({ ok: true, forfeited: 2 });
    expect(await memberRow(memberId)).toEqual({ status: "inactive", matches_remaining: 0 });
  });

  it("removes this month's opt-in while the round is still open", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 1 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });
    const supabase = createTestSupabase();
    await supabase
      .from("monthly_participation")
      .insert({ member_id: memberId, month: thisMonth(), match_type: "in_person" });

    await endMembershipNow(memberId);

    const { data } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId);
    expect(data).toEqual([]);
  });

  it("writes no ledger entry when there is nothing to forfeit", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 0 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });

    const result = await endMembershipNow(memberId);

    expect(result).toEqual({ ok: true, forfeited: 0 });
    expect(await ledgerRows(memberId)).toEqual([]);
  });

  it("is safe to call twice", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "canceled" });

    await endMembershipNow(memberId);
    const second = await endMembershipNow(memberId);

    expect(second).toEqual({ ok: true, forfeited: 0 });
    expect(await ledgerRows(memberId)).toEqual([{ event: "canceled", delta: -2 }]);
  });

  it("refuses an active member and changes nothing", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });

    const result = await endMembershipNow(memberId);

    expect(result).toEqual({ ok: false, reason: "not_canceling" });
    expect(await ledgerRows(memberId)).toEqual([]);
    expect(await memberRow(memberId)).toEqual({ status: "active", matches_remaining: 2 });
  });

  it("rejects calls without a valid session", async () => {
    expect(await endMembershipNow("")).toEqual({ ok: false, reason: "not_authenticated" });
  });
});
