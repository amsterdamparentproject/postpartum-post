import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { resolveCohortOnly } from "@/lib/cohort";

const SLUG = "test-pool";

/**
 * members.cohort_only is the member's standing match-pool choice. It defaults to
 * true, and is only read for members who have a cohort.
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

  it("is never cohort-only for a member without a cohort", async () => {
    const plain = await seedMember();
    memberIds.push(plain.id);
    expect(await resolveCohortOnly(supabase, plain.id)).toBe(false);
  });
});
