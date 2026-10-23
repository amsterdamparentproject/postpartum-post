/**
 * Track E — the soft "last match" notice in the opt-in email template.
 *
 * optinHtml() is module-private, so these tests go through the real
 * sendOptinEmail() with only @/lib/resend mocked (no real email sent) and
 * assert on the html string it hands to resend.emails.send — same approach
 * as __tests__/lib/emails-match-reveal.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ data: { id: "email_test" }, error: null }),
}));

vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

import { sendOptinEmail, type OptinEmailOptions } from "@/lib/emails/optin";
import { getCohortConfig } from "@/lib/cohort-config";

async function sendWithNotice(lastMatchNotice?: boolean): Promise<string> {
  await sendOptinEmail(
    "recipient@example.test",
    "Robin",
    "https://postpartumpost.com/api/optin?action=coffee",
    "https://postpartumpost.com/api/optin?action=playdate",
    "https://postpartumpost.com/api/optin?action=perks",
    "https://postpartumpost.com/api/optin?action=skip",
    lastMatchNotice
  );
  return mockSend.mock.calls[0][0].html as string;
}

describe("opt-in email — soft last-match notice (Track E)", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  it("includes the soft notice when lastMatchNotice is true", async () => {
    const html = await sendWithNotice(true);
    expect(html).toContain("Notice — 1 match left.");
    expect(html).toContain("This may be your last match in your current bundle, and your bundle is set to renew next month.");
    expect(html).toContain("/billing?utm_source=email&utm_campaign=transactional&utm_content=last-match-notice");
  });

  it("omits the soft notice when lastMatchNotice is false", async () => {
    const html = await sendWithNotice(false);
    expect(html).not.toContain("1 match left");
  });

  it("omits the soft notice by default when the argument is not passed", async () => {
    const html = await sendWithNotice(undefined);
    expect(html).not.toContain("1 match left");
  });

  it("still includes the ordinary opt-in content regardless of the notice", async () => {
    const html = await sendWithNotice(true);
    expect(html).toContain("Coffee + perks");
    expect(html).toContain("Playdate + perks");
    expect(html).toContain("No meetup, just perks");
    expect(html).toContain("Skip this month");
  });
});

describe("opt-in email — comped cohort members (no Perks)", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  async function sendWithOptions(options?: OptinEmailOptions): Promise<string> {
    await sendOptinEmail(
      "recipient@example.test",
      "Robin",
      "https://postpartumpost.com/api/optin?action=coffee",
      "https://postpartumpost.com/api/optin?action=playdate",
      "https://postpartumpost.com/api/optin?action=perks",
      "https://postpartumpost.com/api/optin?action=skip",
      false,
      options
    );
    return mockSend.mock.calls[0][0].html as string;
  }

  it("shows the Perks buttons and copy by default", async () => {
    const html = await sendWithOptions();
    expect(html).toContain("Coffee + perks");
    expect(html).toContain("No meetup, just perks");
    expect(html).toContain("along with all of the Post Perks");
  });

  it("drops every Perks mention and the perks-only link when perksEnabled is false", async () => {
    const html = await sendWithOptions({ perksEnabled: false });
    expect(html).not.toMatch(/perks/i);
    expect(html).toContain("☕ Coffee");
    expect(html).toContain("🛝 Playdate");
    expect(html).toContain("action=coffee");
    expect(html).toContain("action=skip");
  });

  it("tells a comped cohort member this is their free match, and that skipping keeps it for next month", async () => {
    const html = await sendWithOptions({ perksEnabled: false, cohortName: "Dutch Speaking Academy", cohortFreeMatch: true });
    expect(html).toContain("your free match from Dutch Speaking Academy");
    // The free-match note takes the place of the usual "Need a break?" footer line.
    expect(html).toContain("skip this month</a> and use your free match next month");
    expect(html).toContain("If we don't hear from you by the 5th, your free match is used up.");
    expect(html).toContain("can't guarantee that you'll be matched with another Dutch Speaking Academy member");
    expect(html).toContain("action=skip");
  });

  // What the send route passes for a cohort slug (lib/cohort-config.ts).
  function cohortOptions(slug: string, cohortName: string): OptinEmailOptions {
    const config = getCohortConfig(slug);
    return {
      cohortName,
      cohortHeaderHtml: config.headerHtml ?? null,
      cohortHeaderPreload: config.headerPreload ?? null,
      cohortNote: config.optinNote ?? null,
    };
  }

  it("uses the double-branded header and explains online matching for the dsa cohort", async () => {
    const html = await sendWithOptions(cohortOptions("dsa", "Dutch Speaking Academy"));
    expect(html).toContain("welcome-dsa.png");
    expect(html).toContain('rel="preload"');
    expect(html).toContain("Live outside Amsterdam?");
    expect(html).toContain("a video call is a great way to practice Dutch");
  });

  it("falls back to the generic header and no extra note for a cohort with no config", async () => {
    const html = await sendWithOptions(cohortOptions("some-new-cohort", "Some New Cohort"));
    // Still told which cohort the round is in, but nothing DSA-specific.
    expect(html).toContain("This round you'll be matched with another parent from");
    expect(html).toContain("Some New Cohort");
    expect(html).not.toContain("welcome-dsa.png");
    expect(html).not.toContain('rel="preload"');
    expect(html).not.toContain("Live outside Amsterdam?");
    expect(html).not.toContain("practice Dutch");
  });

  it("escapes the cohort note", async () => {
    const html = await sendWithOptions({ cohortName: "X", cohortNote: { lead: "A & B", body: "<b>hi</b>" } });
    expect(html).toContain("A &amp; B");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).not.toContain("<b>hi</b>");
  });

  it("says the round is within the cohort but not that skipping uses up a free match, for a paying member", async () => {
    const html = await sendWithOptions({ ...cohortOptions("dsa", "Dutch Speaking Academy"), cohortFreeMatch: false });
    expect(html).toContain("This round you'll be matched with another parent from");
    expect(html).toContain("<span style=\"font-weight:700\">Dutch Speaking Academy</span>");
    expect(html).not.toContain("your free match from");
    expect(html).toContain("Need a break?");
    expect(html).toContain("action=skip");
  });

  it("keeps the regular header and no cohort copy without a cohort", async () => {
    const html = await sendWithOptions();
    expect(html).not.toContain("welcome-dsa.png");
    expect(html).not.toContain("Live outside Amsterdam?");
  });
});
