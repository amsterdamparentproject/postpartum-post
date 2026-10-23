import { describe, it, expect, afterEach } from "vitest";
import { createTestSupabase, seedMember, seedSubscription, cleanupMember } from "@tests/helpers";
import { compMember, lookupCompTarget, splitName, MAX_COMP_ROUNDS } from "@/lib/comp-member";
import { hasPerksAccess, isComped } from "@/lib/billing-mode";

describe("splitName", () => {
  it("splits on the first space and tolerates blanks", () => {
    expect(splitName("Holly Yao Shi")).toEqual({ firstName: "Holly", lastName: "Yao Shi" });
    expect(splitName("  Grazyna  ")).toEqual({ firstName: "Grazyna", lastName: "" });
    expect(splitName(undefined)).toEqual({ firstName: "", lastName: "" });
  });
});

const uniqueEmail = (label: string) => `amsterdamparentproject+${label}-${crypto.randomUUID()}@gmail.com`;

describe("compMember — integration", () => {
  const ids: string[] = [];
  afterEach(async () => {
    for (const id of ids.splice(0)) await cleanupMember(id);
  });

  async function comp(includePerks: boolean) {
    const supabase = createTestSupabase();
    const email = uniqueEmail("comp");
    const result = await compMember(supabase, { email: `  ${email.toUpperCase()} `, name: "Test Winner", includePerks, reason: "giveaway" });
    if ("error" in result || result.existing) throw new Error("expected a new member");
    ids.push(result.memberId);
    const { data } = await supabase
      .from("members")
      .select("email, first_name, last_name, status, billing_mode, cohort, matches_remaining, stripe_customer_id")
      .eq("id", result.memberId)
      .single();
    return { supabase, result, data, email };
  }

  it("creates an active comped member with Perks and one round, and no Stripe link", async () => {
    const { data, email } = await comp(true);
    expect(data).toMatchObject({
      email: email.toLowerCase(),
      first_name: "Test",
      last_name: "Winner",
      status: "active",
      billing_mode: "comped_with_perks",
      cohort: null,
      matches_remaining: 1,
      stripe_customer_id: null,
    });
    expect(isComped(data?.billing_mode)).toBe(true);
    expect(hasPerksAccess(data?.billing_mode)).toBe(true);
  });

  it("can comp match only, without Perks", async () => {
    const { data } = await comp(false);
    expect(data?.billing_mode).toBe("comped_no_perks");
    expect(hasPerksAccess(data?.billing_mode)).toBe(false);
    expect(data?.matches_remaining).toBe(1);
  });

  it("writes a manual_grant ledger row", async () => {
    const { supabase, result } = await comp(true);
    const { data } = await supabase
      .from("match_entitlements")
      .select("event, delta, note")
      .eq("member_id", result.memberId);
    expect(data).toEqual([{ event: "manual_grant", delta: 1, note: "comped:giveaway" }]);
  });

  it("adds one round to an existing paying member without changing their plan", async () => {
    const existing = await seedMember({ matches_remaining: 2 });
    ids.push(existing.id);
    await seedSubscription(existing.id);
    const result = await compMember(createTestSupabase(), { email: existing.email, includePerks: false, reason: "other" });
    expect(result).toMatchObject({ ok: true, existing: true, matchesRemaining: 3 });
    const { data } = await createTestSupabase().from("members").select("matches_remaining, billing_mode").eq("id", existing.id).single();
    expect(data).toEqual({ matches_remaining: 3, billing_mode: "subscription" });
  });

  it("adds one round to an existing comped member, keeping their billing mode", async () => {
    const existing = await seedMember({ matches_remaining: 0, billing_mode: "comped_no_perks" });
    ids.push(existing.id);
    const result = await compMember(createTestSupabase(), { email: existing.email, includePerks: true, reason: "other" });
    expect(result).toMatchObject({ ok: true, existing: true, matchesRemaining: 1 });
    const { data } = await createTestSupabase().from("members").select("billing_mode").eq("id", existing.id).single();
    expect(data?.billing_mode).toBe("comped_no_perks");
  });

  it("records the reason on the ledger, for new and existing members", async () => {
    const supabase = createTestSupabase();
    const created = await compMember(supabase, { email: uniqueEmail("reason"), includePerks: true, reason: "friend_gift" });
    if ("error" in created || created.existing) throw new Error("expected a new member");
    ids.push(created.memberId);
    const existing = await seedMember({ matches_remaining: 0, billing_mode: "comped_with_perks" });
    ids.push(existing.id);
    await compMember(supabase, { email: existing.email, includePerks: true, reason: "customer_service" });
    const notes = async (id: string) =>
      (await supabase.from("match_entitlements").select("note").eq("member_id", id)).data?.map((r) => r.note);
    expect(await notes(created.memberId)).toEqual(["comped:friend_gift"]);
    expect(await notes(existing.id)).toEqual(["comped:customer_service"]);
  });

  it("rejects an unknown reason and creates nobody", async () => {
    const supabase = createTestSupabase();
    const email = uniqueEmail("noreason");
    const result = await compMember(supabase, { email, includePerks: true, reason: "because" as never });
    expect(result).toHaveProperty("error");
    expect((await supabase.from("members").select("id").eq("email", email.toLowerCase()).maybeSingle()).data).toBeNull();
  });

  it("gives a new member several rounds in one grant", async () => {
    const supabase = createTestSupabase();
    const result = await compMember(supabase, { email: uniqueEmail("rounds"), includePerks: true, reason: "other", rounds: 3 });
    if ("error" in result || result.existing) throw new Error("expected a new member");
    ids.push(result.memberId);
    expect(result.rounds).toBe(3);
    const { data } = await supabase.from("members").select("matches_remaining").eq("id", result.memberId).single();
    expect(data?.matches_remaining).toBe(3);
    const { data: ledger } = await supabase.from("match_entitlements").select("delta").eq("member_id", result.memberId);
    expect(ledger).toEqual([{ delta: 3 }]);
  });

  it("adds several rounds to an existing paying member and to an existing comped member", async () => {
    const supabase = createTestSupabase();
    const paying = await seedMember({ matches_remaining: 2 });
    const comped = await seedMember({ matches_remaining: 0, billing_mode: "comped_with_perks" });
    ids.push(paying.id, comped.id);
    await seedSubscription(paying.id);
    expect(await compMember(supabase, { email: paying.email, includePerks: true, reason: "other", rounds: 4 })).toMatchObject({ existing: true, rounds: 4, matchesRemaining: 6, firstName: expect.any(String) });
    expect(await compMember(supabase, { email: comped.email, includePerks: true, reason: "other", rounds: 2 })).toMatchObject({ existing: true, rounds: 2, matchesRemaining: 2 });
  });

  it("rejects rounds that are zero, negative, fractional or over the limit, and creates nobody", async () => {
    const supabase = createTestSupabase();
    for (const rounds of [0, -1, 1.5, MAX_COMP_ROUNDS + 1]) {
      const email = uniqueEmail("badrounds");
      expect(await compMember(supabase, { email, includePerks: true, reason: "other", rounds })).toHaveProperty("error");
      const { data } = await supabase.from("members").select("id").eq("email", email.toLowerCase()).maybeSingle();
      expect(data).toBeNull();
    }
  });

  it("refuses an existing member who isn't active", async () => {
    const existing = await seedMember({ matches_remaining: 0, status: "inactive" });
    ids.push(existing.id);
    const result = await compMember(createTestSupabase(), { email: existing.email, includePerks: true, reason: "other" });
    expect(result).toHaveProperty("error");
    const { data } = await createTestSupabase().from("members").select("matches_remaining").eq("id", existing.id).single();
    expect(data?.matches_remaining).toBe(0);
  });

  it("rejects an invalid email", async () => {
    expect(await compMember(createTestSupabase(), { email: "not-an-email", includePerks: true, reason: "other" })).toHaveProperty("error");
  });

  it("looks up what would happen for an email without changing anything", async () => {
    const supabase = createTestSupabase();
    const active = await seedMember();
    const inactive = await seedMember({ status: "inactive" });
    ids.push(active.id, inactive.id);
    expect(await lookupCompTarget(supabase, ` ${active.email.toUpperCase()} `)).toEqual({ kind: "existing" });
    expect(await lookupCompTarget(supabase, inactive.email)).toEqual({ kind: "blocked", status: "inactive" });
    expect(await lookupCompTarget(supabase, uniqueEmail("nobody"))).toEqual({ kind: "new" });
    expect(await lookupCompTarget(supabase, "nope")).toEqual({ kind: "invalid" });
  });
});
