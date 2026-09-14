import { describe, it, expect, afterEach } from "vitest";
import {
  createTestSupabase,
  seedPartnerLead,
  cleanupPartnerLead,
  getPartnerLead,
  testLeadUrl,
} from "@tests/helpers";
import { findMatchingLead, mergeIntoLead } from "@/lib/lead-matching";

/**
 * lib/lead-matching.ts is the one piece of partner-ingestion logic where a
 * bug would silently corrupt data (wrongly merging two different
 * businesses, or failing to catch a real duplicate) rather than just
 * erroring loudly — so this is tested directly against the shape
 * findMatchingLead actually selects, not mocked.
 */

describe("findMatchingLead", () => {
  let leadId: string | undefined;

  afterEach(async () => {
    await cleanupPartnerLead(leadId);
    leadId = undefined;
  });

  it("returns null when nothing matches business name or url", async () => {
    const supabase = createTestSupabase();
    const match = await findMatchingLead(supabase, "Nobody's Business", testLeadUrl("no-match"));
    expect(match).toBeNull();
  });

  it("matches on business name, ignoring case and leading/trailing whitespace", async () => {
    const supabase = createTestSupabase();
    const seeded = await seedPartnerLead({ business_name: "Joe's Coffee Shop" });
    leadId = seeded.id;

    const match = await findMatchingLead(supabase, "  JOE'S COFFEE SHOP  ", testLeadUrl("different"));
    expect(match?.id).toBe(seeded.id);
  });

  it("matches on url, ignoring case and a trailing slash", async () => {
    const supabase = createTestSupabase();
    const seeded = await seedPartnerLead({ url: "https://Example-Test.com/" });
    leadId = seeded.id;

    const match = await findMatchingLead(supabase, "A Totally Different Name", "https://example-test.com");
    expect(match?.id).toBe(seeded.id);
  });

  it("does not fuzzy-match a similar-but-different business name", async () => {
    const supabase = createTestSupabase();
    const seeded = await seedPartnerLead({ business_name: "Joe's Coffee Shop" });
    leadId = seeded.id;

    // Deliberately not exact: this is the documented tradeoff (1:1 match
    // only, no fuzzy matching) — Alex catches near-duplicates herself via
    // the alphabetically-sorted leads list instead.
    const match = await findMatchingLead(supabase, "Joe's Coffee", testLeadUrl("near-miss"));
    expect(match).toBeNull();
  });
});

describe("mergeIntoLead", () => {
  let leadId: string | undefined;

  afterEach(async () => {
    await cleanupPartnerLead(leadId);
    leadId = undefined;
  });

  it("appends the new note without dropping existing notes", async () => {
    const supabase = createTestSupabase();
    const seeded = await seedPartnerLead({
      notes: [{ id: "n1", date: "2026-01-01T00:00:00.000Z", note: "first note" }],
    });
    leadId = seeded.id;

    const result = await mergeIntoLead(supabase, seeded, { note: "second note" });
    expect(result.success).toBe(true);

    const updated = await getPartnerLead(seeded.id);
    expect(updated?.notes).toHaveLength(2);
    expect(updated?.notes[0].note).toBe("first note");
    expect(updated?.notes[1].note).toBe("second note");
  });

  it("backfills missing contact fields but never overwrites existing ones", async () => {
    const supabase = createTestSupabase();
    const seeded = await seedPartnerLead({
      first_name: null,
      last_name: null,
      email: "keep-me@example.com",
    });
    leadId = seeded.id;

    await mergeIntoLead(supabase, seeded, {
      note: "filled in",
      firstName: "New",
      lastName: "Contact",
      email: "should-not-overwrite@example.com",
    });

    const updated = await getPartnerLead(seeded.id);
    expect(updated?.first_name).toBe("New");
    expect(updated?.last_name).toBe("Contact");
    expect(updated?.email).toBe("keep-me@example.com");
  });

  it("bumps status from 'idea' to 'new'", async () => {
    const supabase = createTestSupabase();
    const seeded = await seedPartnerLead({ status: "idea" });
    leadId = seeded.id;

    await mergeIntoLead(supabase, seeded, { note: "confirmed" });

    const updated = await getPartnerLead(seeded.id);
    expect(updated?.status).toBe("new");
  });

  it.each(["contacted", "converted", "rejected"])(
    "leaves status '%s' untouched — only 'idea' gets promoted",
    async (status) => {
      const supabase = createTestSupabase();
      const seeded = await seedPartnerLead({ status });
      leadId = seeded.id;

      await mergeIntoLead(supabase, seeded, { note: "a note" });

      const updated = await getPartnerLead(seeded.id);
      expect(updated?.status).toBe(status);
    }
  );
});
