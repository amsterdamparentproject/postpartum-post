/**
 * The cohort welcome email: DSA gets its banner and Dutch-practice wording
 * from lib/cohort-config.ts; a cohort with no config gets the generic banner
 * and cohort-neutral wording. Goes through the real sendCohortWelcomeEmail
 * with only @/lib/resend mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ data: { id: "email_test" }, error: null }),
}));

vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

import { sendCohortWelcomeEmail } from "@/lib/emails/welcome-cohort";
import { getCohortConfig } from "@/lib/cohort-config";

// What signupCohort passes for a cohort slug.
async function welcomeFor(slug: string, name: string): Promise<string> {
  const config = getCohortConfig(slug);
  await sendCohortWelcomeEmail("r@example.test", "Robin", "https://postpartumpost.com/signin", name, {
    headerHtml: config.headerHtml ?? null,
    headerPreload: config.headerPreload ?? null,
    matchLine: config.welcomeMatchLine ?? null,
    continueLine: config.welcomeContinueLine ?? null,
    giftLine: config.welcomeGiftLine ?? null,
  });
  return mockSend.mock.calls[0][0].html as string;
}

describe("cohort welcome email", () => {
  beforeEach(() => mockSend.mockClear());

  it("uses the double-branded banner and the Dutch-practice wording for dsa", async () => {
    const html = await welcomeFor("dsa", "Dutch Speaking Academy");
    expect(html).toContain("welcome-dsa.png");
    expect(html).toContain('rel="preload"');
    expect(html).toContain("Every round starts with a hand-picked introduction, delivered via email. Your match will be another parent from Dutch Speaking Academy to practice real Dutch with, in person if you live nearby");
    expect(html).toContain("continue practicing Dutch and/or meeting new parents");
    expect(html).toContain("Your match is a gift from your course — no charge");
    expect(html).toContain("You've joined the Dutch Speaking Academy cohort, and your free match is waiting.");
  });

  it("falls back to the generic banner and neutral wording for a cohort with no config", async () => {
    const html = await welcomeFor("some-new-cohort", "Some New Cohort");
    expect(html).not.toContain("welcome-dsa.png");
    expect(html).not.toContain('rel="preload"');
    expect(html).not.toMatch(/Dutch/);
    expect(html).toContain("You've joined the Some New Cohort cohort, and your free match is waiting.");
    expect(html).toContain("Every month is a match: We send you a hand-picked introduction via email to another parent from Some New Cohort — in person if you live nearby or on a video call if you don't.");
    expect(html).toContain("If you want to keep meeting new parents afterwards");
    expect(html).toContain("This match is a gift — there's no charge, and nothing renews on its own.");
    expect(html).toContain("keep an eye on your inbox at the end of the month!");
    expect(html).not.toContain("from your course");
  });

  it("keeps the shared parts for every cohort", async () => {
    for (const [slug, name] of [["dsa", "Dutch Speaking Academy"], ["x", "X"]]) {
      mockSend.mockClear();
      const html = await welcomeFor(slug, name);
      expect(html).toContain("Welcome, Robin!");
      expect(html).toContain("between the 1st and the 5th");
      expect(html).toContain("Go to my profile");
    // The CTA is the one link to the profile; the sentence above it is plain text.
    expect(html).not.toContain("/profile");
      expect(html).toContain("nothing renews on its own.");
      expect(html).toContain("We're really excited to have you in the community.");
    }
  });

  it("escapes a cohort name in the generic copy", async () => {
    const html = await welcomeFor("x", "A & B");
    expect(html).toContain("another parent from A &amp; B —");
  });
});
