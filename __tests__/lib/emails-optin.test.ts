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

import { sendOptinEmail } from "@/lib/emails/optin";

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

  async function sendWithOptions(options?: { perksEnabled?: boolean; cohortName?: string | null }): Promise<string> {
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

  it("tells a cohort member the match is within the cohort and expires if skipped", async () => {
    const html = await sendWithOptions({ perksEnabled: false, cohortName: "Dutch for Parents" });
    expect(html).toContain("your free match from Dutch for Parents");
    expect(html).toContain("another student from the course");
  });
});
