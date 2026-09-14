import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitPartnerLead, submitPerkIdea } from "@/app/actions/partners";
import { addPartnerLeadIdea } from "@/app/admin/partners/actions";
import {
  cleanupPartnerLead,
  cleanupPartnerLeadByUrl,
  findPartnerLeadByUrl,
  getPartnerLead,
  seedPartnerLead,
  testLeadUrl,
} from "@tests/helpers";

// ---------------------------------------------------------------------------
// Mocks — the only real side effect these actions have besides the DB write
// ---------------------------------------------------------------------------

const { mockSendPartnerLeadEmail } = vi.hoisted(() => ({
  mockSendPartnerLeadEmail: vi.fn(),
}));

vi.mock("@/lib/emails/partner-lead", () => ({
  sendPartnerLeadEmail: mockSendPartnerLeadEmail,
}));

beforeEach(() => {
  mockSendPartnerLeadEmail.mockReset();
  mockSendPartnerLeadEmail.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// submitPartnerLead — the public /partners "express interest" form
// ---------------------------------------------------------------------------

describe("submitPartnerLead", () => {
  let url: string;

  beforeEach(() => {
    url = testLeadUrl("submit");
  });

  afterEach(async () => {
    await cleanupPartnerLeadByUrl(url);
  });

  it("rejects a submission with any required field missing", async () => {
    const result = await submitPartnerLead({
      firstName: "Alex",
      lastName: "", // missing
      businessName: "Test Biz",
      url,
      email: "alex@example.com",
      note: "a note",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(await findPartnerLeadByUrl(url)).toBeNull();
    expect(mockSendPartnerLeadEmail).not.toHaveBeenCalled();
  });

  it("creates a new lead with status 'new' when nothing matches", async () => {
    const result = await submitPartnerLead({
      firstName: "Alex",
      lastName: "Siega",
      businessName: `Test Business ${url}`,
      url,
      email: "alex@example.com",
      note: "Would love to offer members a discount",
    });
    expect(result.success).toBe(true);

    const row = await findPartnerLeadByUrl(url);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("new");
    expect(row?.notes).toHaveLength(1);
    expect(row?.notes[0].note).toBe("Would love to offer members a discount");
  });

  it("emails Alex a notification on a new submission", async () => {
    await submitPartnerLead({
      firstName: "Alex",
      lastName: "Siega",
      businessName: `Test Business ${url}`,
      url,
      email: "contact@example.com",
      note: "note",
    });
    expect(mockSendPartnerLeadEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPartnerLeadEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "contact@example.com", url })
    );
  });

  it("still saves the lead even if the notification email fails (fire-and-forget)", async () => {
    mockSendPartnerLeadEmail.mockRejectedValueOnce(new Error("resend is down"));

    const result = await submitPartnerLead({
      firstName: "Alex",
      lastName: "Siega",
      businessName: `Test Business ${url}`,
      url,
      email: "alex@example.com",
      note: "note",
    });

    expect(result.success).toBe(true);
    expect(await findPartnerLeadByUrl(url)).not.toBeNull();
  });

  it("merges into an existing lead by business name instead of creating a duplicate row", async () => {
    const businessName = `Merge Test ${url}`;
    const seeded = await seedPartnerLead({ business_name: businessName, status: "idea" });

    try {
      const result = await submitPartnerLead({
        firstName: "New",
        lastName: "Contact",
        businessName, // same name...
        url, // ...but a different url — still expected to match on name
        email: "new-contact@example.com",
        note: "Confirming interest",
      });
      expect(result.success).toBe(true);

      // No new row was created at the submitted url — it landed on the
      // existing lead instead.
      expect(await findPartnerLeadByUrl(url)).toBeNull();

      const merged = await getPartnerLead(seeded.id);
      expect(merged?.notes).toHaveLength(1);
      expect(merged?.notes[0].note).toBe("Confirming interest");
      expect(merged?.email).toBe("new-contact@example.com"); // backfilled, was null
      // A real submission confirming the business is a stronger signal than
      // Alex's own 'idea' guess — status should promote.
      expect(merged?.status).toBe("new");
    } finally {
      await cleanupPartnerLead(seeded.id);
    }
  });

  it("does not overwrite an existing lead's status on merge if it's already past 'idea'", async () => {
    const businessName = `Merge Test Contacted ${url}`;
    const seeded = await seedPartnerLead({ business_name: businessName, status: "contacted" });

    try {
      await submitPartnerLead({
        firstName: "New",
        lastName: "Contact",
        businessName,
        url,
        email: "new-contact@example.com",
        note: "Following up",
      });

      const merged = await getPartnerLead(seeded.id);
      expect(merged?.status).toBe("contacted");
    } finally {
      await cleanupPartnerLead(seeded.id);
    }
  });
});

// ---------------------------------------------------------------------------
// submitPerkIdea — the anonymous "know a place?" box on /perks
// ---------------------------------------------------------------------------

describe("submitPerkIdea", () => {
  afterEach(async () => {
    vi.clearAllMocks();
  });

  it("rejects a blank url", async () => {
    const result = await submitPerkIdea({ url: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("creates an 'idea'-status lead, guessing the business name from the hostname", async () => {
    const url = `https://www.test-perk-idea-${crypto.randomUUID().slice(0, 8)}.com`;
    try {
      const result = await submitPerkIdea({ url });
      expect(result.success).toBe(true);

      const row = await findPartnerLeadByUrl(url);
      expect(row).not.toBeNull();
      expect(row?.status).toBe("idea");
      // "www." is stripped; nothing else is guessed beyond the hostname.
      expect(row?.business_name).toBe(url.replace("https://www.", ""));
      expect(row?.notes[0].note).toContain("Suggested by a member via the /perks page");
    } finally {
      await cleanupPartnerLeadByUrl(url);
    }
  });

  it("guesses a business name from a Google Maps place link", async () => {
    const placeName = `Joe's Coffee ${crypto.randomUUID().slice(0, 8)}`;
    const url = `https://www.google.com/maps/place/${encodeURIComponent(placeName).replace(/%20/g, "+")}/@52.37,4.89,15z`;
    try {
      const result = await submitPerkIdea({ url });
      expect(result.success).toBe(true);

      const row = await findPartnerLeadByUrl(url);
      expect(row?.business_name).toBe(placeName);
    } finally {
      await cleanupPartnerLeadByUrl(url);
    }
  });

  it("never sends Alex an email notification (only submitPartnerLead does)", async () => {
    const url = testLeadUrl("perk-idea-no-email");
    try {
      await submitPerkIdea({ url });
      expect(mockSendPartnerLeadEmail).not.toHaveBeenCalled();
    } finally {
      await cleanupPartnerLeadByUrl(url);
    }
  });

  it("on a repeat suggestion for the same business, appends a note but never promotes status", async () => {
    const businessName = `Suggested Twice ${crypto.randomUUID().slice(0, 8)}`;
    const url = testLeadUrl("perk-idea-repeat");
    const seeded = await seedPartnerLead({ business_name: businessName, url, status: "idea" });

    try {
      // guessBusinessNameFromUrl(url) won't equal businessName here (it's
      // not a real hostname match) — this exercises the url-match branch
      // of findMatchingLead, same as findMatchingLead's own url test above.
      const result = await submitPerkIdea({ url });
      expect(result.success).toBe(true);

      const merged = await getPartnerLead(seeded.id);
      expect(merged?.notes).toHaveLength(1);
      expect(merged?.notes[0].note).toContain("Suggested again via the /perks page");
      // Unlike submitPartnerLead's merge, an anonymous member suggestion
      // is never the business itself confirming — status must not move.
      expect(merged?.status).toBe("idea");
    } finally {
      await cleanupPartnerLead(seeded.id);
    }
  });
});

// ---------------------------------------------------------------------------
// addPartnerLeadIdea — Alex adding a prospect herself from /admin/partners
// ---------------------------------------------------------------------------

describe("addPartnerLeadIdea", () => {
  it("rejects a submission missing business name, url, or note", async () => {
    const result = await addPartnerLeadIdea({
      businessName: "",
      url: testLeadUrl("admin-idea-invalid"),
      note: "a note",
      firstName: "",
      lastName: "",
      email: "",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("creates an 'idea'-status lead with optional contact fields left null", async () => {
    const url = testLeadUrl("admin-idea");
    try {
      const result = await addPartnerLeadIdea({
        businessName: `Admin Idea ${url}`,
        url,
        note: "Saw this on Instagram, looks like a great fit",
        firstName: "",
        lastName: "",
        email: "",
      });
      expect(result.success).toBe(true);

      const row = await findPartnerLeadByUrl(url);
      expect(row?.status).toBe("idea");
      expect(row?.first_name).toBeNull();
      expect(row?.notes[0].note).toBe("Saw this on Instagram, looks like a great fit");
    } finally {
      await cleanupPartnerLeadByUrl(url);
    }
  });

  it("merges into an existing lead by url instead of duplicating it", async () => {
    const url = testLeadUrl("admin-idea-merge");
    const seeded = await seedPartnerLead({ url, status: "idea" });

    try {
      const result = await addPartnerLeadIdea({
        businessName: "A Different Guess At The Name",
        url,
        note: "Second admin note",
        firstName: "",
        lastName: "",
        email: "",
      });
      expect(result.success).toBe(true);
      expect(await findPartnerLeadByUrl(url)).toEqual(
        expect.objectContaining({ id: seeded.id }) // same row, not a new one
      );

      const merged = await getPartnerLead(seeded.id);
      expect(merged?.notes).toHaveLength(1);
      expect(merged?.notes[0].note).toBe("Second admin note");
    } finally {
      await cleanupPartnerLead(seeded.id);
    }
  });
});
