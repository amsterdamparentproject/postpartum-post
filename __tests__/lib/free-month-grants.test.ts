import { describe, it, expect, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { grantFreeMonth } from "@/lib/free-month-grants";

// Track F: grantFreeMonth used to push a subscription's Stripe billing date
// out (pause_collection for monthly plans, trial_end extension for 3-month
// plans) — a plan-type branch that made sense back when a subscription's
// own billing date was the thing being granted. Now that renew-check bills
// purely off matches_remaining, a free month is just +1 on the counter,
// plan-blind, with no Stripe call at all — so there's no Stripe mock in
// this file anymore.

describe("grantFreeMonth", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("throws if no member exists for the given email", async () => {
    await expect(
      grantFreeMonth("nobody-here@example.com", "customer_service")
    ).rejects.toThrow(/No member found/);
  });

  it("throws if the member has no active subscription", async () => {
    const member = await seedMember();
    memberId = member.id;
    // No seedSubscription() call — member exists but has no subscription row.

    await expect(
      grantFreeMonth(member.email, "customer_service")
    ).rejects.toThrow(/No active subscription/);
  });

  it("credits +1 match and returns the new balance", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberId = member.id;
    await seedSubscription(memberId);

    const result = await grantFreeMonth(member.email, "customer_service");

    expect(result).toMatchObject({
      memberEmail: member.email,
      matchesGranted: 1,
      matchesRemaining: 1,
    });

    const supabase = createTestSupabase();
    const { data: updated } = await supabase
      .from("members")
      .select("matches_remaining")
      .eq("id", memberId)
      .single();
    expect(updated?.matches_remaining).toBe(1);
  });

  it("grants the same way regardless of plan type — no plan-based branching", async () => {
    const member = await seedMember({ matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { stripe_price_id: "price_founding" });

    const result = await grantFreeMonth(member.email, "art_comp");

    expect(result.matchesGranted).toBe(1);
    expect(result.matchesRemaining).toBe(3);
  });

  it("writes a manual_grant row tagged with the given reason", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId);

    await grantFreeMonth(member.email, "art_comp");

    const supabase = createTestSupabase();
    const { data: rows } = await supabase
      .from("match_entitlements")
      .select("event, delta, note")
      .eq("member_id", memberId);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ event: "manual_grant", delta: 1, note: "art_comp" });
  });

  it("accepts an arbitrary reason string without validation", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(memberId);

    await expect(
      grantFreeMonth(member.email, "totally-made-up-reason")
    ).resolves.toMatchObject({ matchesGranted: 1 });
  });
});
