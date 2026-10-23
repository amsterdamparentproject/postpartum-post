import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { resolveCohortOnly } from "@/lib/cohort";

const SLUG = "test-pool";

/**
 * members.cohort_only is the member's standing match-pool choice. It is false by
 * default, a trigger (migration 036) turns it on when a member joins a cohort,
 * and it is only read for members who have a cohort.
 */
describe("cohort match pool — integration", () => {
  const memberIds: string[] = [];
  const supabase = createTestSupabase();

  async function seedCohortMember(fields: Record<string, unknown> = {}) {
    const member = await seedMember({ matches_remaining: 2 });
    memberIds.push(member.id);
    const { error } = await supabase.from("members").update({ cohort: SLUG, ...fields }).eq("id", member.id);
    if (error) throw new Error(error.message);
    return member;
  }

  beforeEach(async () => {
    await supabase.from("cohorts").delete().eq("slug", SLUG);
    const { error } = await supabase.from("cohorts").insert({ slug: SLUG, name: "Test Academy" });
    if (error) throw new Error(error.message);
  });

  afterEach(async () => {
    for (const id of memberIds.splice(0)) await cleanupMember(id);
    await supabase.from("cohorts").delete().eq("slug", SLUG);
  });

  it("defaults a cohort member to cohort-only until they choose Anyone", async () => {
    const m = await seedCohortMember();
    expect(await resolveCohortOnly(supabase, m.id)).toBe(true);

    await supabase.from("members").update({ cohort_only: false }).eq("id", m.id);
    expect(await resolveCohortOnly(supabase, m.id)).toBe(false);
  });

  it("applies the same rule to comped and paying members", async () => {
    const comped = await seedCohortMember({ billing_mode: "comped_no_perks" });
    const paying = await seedCohortMember({ billing_mode: "subscription" });
    expect(await resolveCohortOnly(supabase, comped.id)).toBe(true);
    expect(await resolveCohortOnly(supabase, paying.id)).toBe(true);

    await supabase.from("members").update({ cohort_only: false }).in("id", [comped.id, paying.id]);
    expect(await resolveCohortOnly(supabase, comped.id)).toBe(false);
    expect(await resolveCohortOnly(supabase, paying.id)).toBe(false);
  });

  it("starts false for a member without a cohort, and turns on when they join one", async () => {
    const m = await seedMember();
    memberIds.push(m.id);
    const read = async () =>
      (await supabase.from("members").select("cohort_only").eq("id", m.id).single()).data!.cohort_only;
    expect(await read()).toBe(false);

    await supabase.from("members").update({ cohort: SLUG }).eq("id", m.id);
    expect(await read()).toBe(true);
  });

  it("turns on for a member created with a cohort", async () => {
    const { data, error } = await supabase
      .from("members")
      .insert({
        first_name: "Pool",
        last_name: "Insert",
        email: `pool-insert-${Date.now()}@example.test`,
        status: "active",
        cohort: SLUG,
        billing_mode: "comped_no_perks",
      })
      .select("id, cohort_only")
      .single();
    if (error || !data) throw new Error(error?.message ?? "insert failed");
    memberIds.push(data.id);
    expect(data.cohort_only).toBe(true);
  });

  it("never overwrites a later choice of Anyone, even when the cohort changes", async () => {
    const other = `${SLUG}-b`;
    await supabase.from("cohorts").delete().eq("slug", other);
    await supabase.from("cohorts").insert({ slug: other, name: "Other Academy" });
    try {
      const m = await seedCohortMember();
      await supabase.from("members").update({ cohort_only: false }).eq("id", m.id);
      await supabase.from("members").update({ cohort: other }).eq("id", m.id);
      expect(await resolveCohortOnly(supabase, m.id)).toBe(false);
    } finally {
      for (const id of memberIds.splice(0)) await cleanupMember(id);
      await supabase.from("cohorts").delete().eq("slug", other);
    }
  });

  it("is never cohort-only for a member without a cohort", async () => {
    const plain = await seedMember();
    memberIds.push(plain.id);
    expect(await resolveCohortOnly(supabase, plain.id)).toBe(false);
  });
});
