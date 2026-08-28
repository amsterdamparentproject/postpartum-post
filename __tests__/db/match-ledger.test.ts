/**
 * Schema-level tests for migration 022 (match_ledger) — see
 * __claude__/billing-simplification-plan.md §2.7. These are regression
 * tests for guarantees the database itself makes: nothing here goes
 * through application code, since none exists yet (Track B, step 1).
 */

import { describe, it, expect, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";

const TEST_MONTH = "2199-02-01"; // far future — avoid colliding with real data
const OTHER_MONTH = "2199-03-01";

async function recordEntitlement(params: {
  memberId: string;
  event: string;
  delta: number;
  month?: string | null;
  matchId?: string | null;
  stripeInvoiceId?: string | null;
  note?: string | null;
}) {
  const supabase = createTestSupabase();
  const { data, error } = await supabase.rpc("record_entitlement", {
    p_member_id: params.memberId,
    p_event: params.event,
    p_delta: params.delta,
    p_month: params.month ?? null,
    p_match_id: params.matchId ?? null,
    p_stripe_invoice_id: params.stripeInvoiceId ?? null,
    p_note: params.note ?? null,
  });
  if (error) throw new Error(`record_entitlement RPC failed: ${error.message}`);
  return data as boolean;
}

async function entitlementRows(memberId: string) {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("match_entitlements")
    .select("event, delta, month, stripe_invoice_id")
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function matchesRemaining(memberId: string) {
  const supabase = createTestSupabase();
  const { data, error } = await supabase
    .from("members")
    .select("matches_remaining")
    .eq("id", memberId)
    .single();
  if (error) throw new Error(error.message);
  return data.matches_remaining as number;
}

describe("match_entitlements / record_entitlement", () => {
  let memberIds: string[] = [];

  afterEach(async () => {
    for (const id of memberIds) await cleanupMember(id);
    memberIds = [];
  });

  it("records a positive entitlement and bumps matches_remaining", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberIds.push(member.id);

    const applied = await recordEntitlement({
      memberId: member.id,
      event: "term_payment",
      delta: 3,
      stripeInvoiceId: `in_test_${member.id.slice(0, 8)}`,
    });

    expect(applied).toBe(true);
    expect(await matchesRemaining(member.id)).toBe(3);
  });

  it("rejects a replayed stripe_invoice_id as a no-op", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberIds.push(member.id);
    const invoiceId = `in_test_replay_${member.id.slice(0, 8)}`;

    const first = await recordEntitlement({
      memberId: member.id,
      event: "term_payment",
      delta: 3,
      stripeInvoiceId: invoiceId,
    });
    const replay = await recordEntitlement({
      memberId: member.id,
      event: "term_payment",
      delta: 3,
      stripeInvoiceId: invoiceId,
    });

    expect(first).toBe(true);
    expect(replay).toBe(false);
    expect(await matchesRemaining(member.id)).toBe(3); // not 6
    expect(await entitlementRows(member.id)).toHaveLength(1);
  });

  it("rejects a second decrement for the same member in the same month — the double-match case", async () => {
    const member = await seedMember({ matches_remaining: 0 /* start with a balance so the floor doesn't mask this */ });
    memberIds.push(member.id);
    await recordEntitlement({ memberId: member.id, event: "term_payment", delta: 3 });

    const firstMatch = await recordEntitlement({
      memberId: member.id,
      event: "match_delivered",
      delta: -1,
      month: TEST_MONTH,
    });
    const secondMatch = await recordEntitlement({
      memberId: member.id,
      event: "match_delivered",
      delta: -1,
      month: TEST_MONTH,
    });

    expect(firstMatch).toBe(true);
    expect(secondMatch).toBe(false);
    expect(await matchesRemaining(member.id)).toBe(2); // debited once, not twice
    const decrementRows = (await entitlementRows(member.id)).filter((r) => r.delta < 0);
    expect(decrementRows).toHaveLength(1);
  });

  it("rejects no_response stacking on top of match_delivered in the same month", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberIds.push(member.id);
    await recordEntitlement({ memberId: member.id, event: "term_payment", delta: 3 });

    const matched = await recordEntitlement({
      memberId: member.id,
      event: "match_delivered",
      delta: -1,
      month: TEST_MONTH,
    });
    const noResponse = await recordEntitlement({
      memberId: member.id,
      event: "no_response",
      delta: -1,
      month: TEST_MONTH,
    });

    expect(matched).toBe(true);
    expect(noResponse).toBe(false); // one decrement per member per month, from any cause
    expect(await matchesRemaining(member.id)).toBe(2);
  });

  it("allows a decrement in a different month for the same member", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberIds.push(member.id);
    await recordEntitlement({ memberId: member.id, event: "term_payment", delta: 3 });

    const first = await recordEntitlement({
      memberId: member.id,
      event: "match_delivered",
      delta: -1,
      month: TEST_MONTH,
    });
    const second = await recordEntitlement({
      memberId: member.id,
      event: "no_response",
      delta: -1,
      month: OTHER_MONTH,
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(await matchesRemaining(member.id)).toBe(1);
  });

  it("floors matches_remaining at zero rather than going negative", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberIds.push(member.id);

    const applied = await recordEntitlement({
      memberId: member.id,
      event: "no_response",
      delta: -1,
      month: TEST_MONTH,
    });

    expect(applied).toBe(true); // the fact is still recorded
    expect(await matchesRemaining(member.id)).toBe(0); // but the counter doesn't go negative
  });

  it("keeps sum(delta) per member equal to matches_remaining", async () => {
    const member = await seedMember({ matches_remaining: 0 });
    memberIds.push(member.id);

    await recordEntitlement({ memberId: member.id, event: "manual_backfill", delta: 2 });
    await recordEntitlement({ memberId: member.id, event: "match_delivered", delta: -1, month: TEST_MONTH });
    await recordEntitlement({ memberId: member.id, event: "term_payment", delta: 3, stripeInvoiceId: `in_test_sum_${member.id.slice(0, 8)}` });

    const rows = await entitlementRows(member.id);
    const sum = rows.reduce((s, r) => s + r.delta, 0);
    expect(sum).toBe(await matchesRemaining(member.id));
  });
});

describe("match_ledger view", () => {
  let memberIds: string[] = [];
  let roundIds: string[] = [];

  afterEach(async () => {
    const supabase = createTestSupabase();
    for (const id of roundIds) {
      await supabase.from("match_rounds").delete().eq("id", id);
    }
    roundIds = [];
    for (const id of memberIds) await cleanupMember(id);
    memberIds = [];
  });

  async function seedRound(month: string, status: "draft" | "committed" | "locked") {
    const supabase = createTestSupabase();
    const { data, error } = await supabase
      .from("match_rounds")
      .insert({ month, status, locked_at: status === "locked" ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seedRound failed: ${error?.message}`);
    roundIds.push(data.id as string);
    return data.id as string;
  }

  async function seedMatch(memberId1: string, memberId2: string, matchedOn: string) {
    const supabase = createTestSupabase();
    const { data, error } = await supabase
      .from("matches")
      .insert({ member_id_1: memberId1, member_id_2: memberId2, matched_on: matchedOn })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seedMatch failed: ${error?.message}`);
    return data.id as string;
  }

  async function ledgerEvents(memberId: string) {
    const supabase = createTestSupabase();
    const { data, error } = await supabase
      .from("match_ledger")
      .select("event, month")
      .eq("member_id", memberId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.event as string);
  }

  it("does not surface `unmatched` for a draft or committed round", async () => {
    const month = "2199-04-01";
    const member = await seedMember();
    memberIds.push(member.id);

    const supabase = createTestSupabase();
    await supabase.from("monthly_participation").insert({
      member_id: member.id,
      month,
      topic_id: (await supabase.from("topics").select("id").limit(1).single()).data!.id,
    });

    const draftRoundId = await seedRound(month, "draft");
    expect(await ledgerEvents(member.id)).not.toContain("unmatched");

    // Swap the round to committed rather than resetting roundIds wholesale —
    // if anything below throws, afterEach can still find and clean up
    // whichever round is currently live instead of leaking it.
    await supabase.from("match_rounds").delete().eq("id", draftRoundId);
    roundIds = roundIds.filter((id) => id !== draftRoundId);

    await seedRound(month, "committed");
    expect(await ledgerEvents(member.id)).not.toContain("unmatched");
  });

  it("surfaces `unmatched` only once the round is locked and the member was never paired", async () => {
    const month = "2199-05-01";
    const member = await seedMember();
    memberIds.push(member.id);

    const supabase = createTestSupabase();
    const topicId = (await supabase.from("topics").select("id").limit(1).single()).data!.id;
    await supabase.from("monthly_participation").insert({ member_id: member.id, month, topic_id: topicId });
    await seedRound(month, "locked");

    expect(await ledgerEvents(member.id)).toContain("unmatched");
  });

  it("does not surface `unmatched` for a locked round when the member was paired", async () => {
    const month = "2199-06-01";
    const a = await seedMember();
    const b = await seedMember();
    memberIds.push(a.id, b.id);

    const supabase = createTestSupabase();
    const topicId = (await supabase.from("topics").select("id").limit(1).single()).data!.id;
    await supabase.from("monthly_participation").insert([
      { member_id: a.id, month, topic_id: topicId },
      { member_id: b.id, month, topic_id: topicId },
    ]);
    await seedMatch(a.id, b.id, month);
    await seedRound(month, "locked");

    expect(await ledgerEvents(a.id)).not.toContain("unmatched");
    expect(await ledgerEvents(b.id)).not.toContain("unmatched");
  });

  it("surfaces `second_match` for the second match in a month, not the first", async () => {
    const month = "2199-07-01";
    const a = await seedMember();
    const b = await seedMember();
    const c = await seedMember();
    memberIds.push(a.id, b.id, c.id);

    await seedMatch(a.id, b.id, month);
    const events = await ledgerEvents(a.id);
    expect(events).not.toContain("second_match");

    await seedMatch(a.id, c.id, month);
    const eventsAfterSecond = await ledgerEvents(a.id);
    expect(eventsAfterSecond.filter((e) => e === "second_match")).toHaveLength(1);
  });

  it("passes through opted_in and skipped as-is", async () => {
    const month = "2199-08-01";
    const member = await seedMember();
    memberIds.push(member.id);

    const supabase = createTestSupabase();
    const topicId = (await supabase.from("topics").select("id").limit(1).single()).data!.id;
    await supabase.from("monthly_participation").insert({ member_id: member.id, month, topic_id: topicId });

    expect(await ledgerEvents(member.id)).toContain("opted_in");

    const other = await seedMember();
    memberIds.push(other.id);
    await supabase.from("monthly_skips").insert({ member_id: other.id, month });
    expect(await ledgerEvents(other.id)).toContain("skipped");
  });
});
