/**
 * Track C4 — the billing-notice section of the match-reveal email template.
 *
 * matchRevealHtml() is module-private, so these tests go through the real
 * sendMatchRevealEmail() with only @/lib/resend mocked (no real email sent)
 * and assert on the html string it hands to resend.emails.send — the same
 * "mock the outermost dependency, assert on real behavior" approach used
 * elsewhere (e.g. __tests__/api/webhooks-stripe.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BillingNotice } from "@/lib/billing-notice";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ data: { id: "email_test" }, error: null }),
}));

vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: mockSend } }),
}));

import { sendMatchRevealEmail } from "@/lib/emails/match-reveal";

async function sendWithNotice(billingNotice: BillingNotice): Promise<string> {
  await sendMatchRevealEmail(
    "recipient@example.test",
    "Robin",
    "Sam",
    "Sample",
    "sam@example.test",
    "coffee",
    "https://postpartumpost.com/matches/m1",
    "https://postpartumpost.com/matches",
    false,
    true,
    billingNotice,
  );
  return mockSend.mock.calls[0][0].html as string;
}

describe("match-reveal email — billing notice (Track C4)", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  it("adds no billing content for a comped (FYP) member", async () => {
    const html = await sendWithNotice({ kind: "none" });
    expect(html).not.toContain("Renews");
    expect(html).not.toContain("matches left");
    expect(html).not.toContain("Manage your membership");
  });

  it("shows the counter line with 2+ matches remaining, in the footer rather than the main body", async () => {
    const html = await sendWithNotice({ kind: "counter", matchesRemaining: 3 });
    expect(html).toContain("Note: You currently have <b>3 matches left</b> in your bundle.");
    expect(html).not.toContain("Manage your membership");
    // Footer placement: after the nonprofit callout's own text, before the
    // copyright/"Manage subscription" line — not up in the main body next
    // to the match-reveal content.
    const nonprofitIdx = html.indexOf("nonprofit community organization");
    const noticeIdx = html.indexOf("3 matches left");
    const copyrightIdx = html.indexOf("Manage subscription");
    expect(nonprofitIdx).toBeGreaterThan(-1);
    expect(noticeIdx).toBeGreaterThan(nonprofitIdx);
    expect(noticeIdx).toBeLessThan(copyrightIdx);
  });

  it("spells out the actual renew-check date in the last-match copy at exactly 1", async () => {
    const html = await sendWithNotice({
      kind: "counter",
      matchesRemaining: 1,
      renewDate: "10 October 2026",
    });
    expect(html).toContain(
      "You currently have <b>1 match left</b> in your bundle. Your subscription is scheduled to renew on 10 October 2026, to keep matching after next month's match."
    );
  });

  it("shows the loud end-of-bundle notice with date, amount, and a link to the billing page", async () => {
    const html = await sendWithNotice({
      kind: "loud",
      renewDate: "20 November 2026",
      amount: "€24",
      isFirstAfterGift: false,
      cancelUrl: "https://postpartumpost.com/billing?utm_content=renewal-notice",
    });
    expect(html).toContain(
      "<b>A note on your subscription:</b> You've used all the matches in your bundle. To keep matching, you'll be charged €24 on 20 November 2026. If you'd like to make changes ahead of next month's match round, go to your"
    );
    expect(html).toContain(">Billing page</a>");
    expect(html).toContain("https://postpartumpost.com/billing?utm_content=renewal-notice");
    expect(html).not.toContain("Manage your membership");
    expect(html).not.toContain("last free match from your gifted subscription");
  });

  it("uses the gift-specific framing when isFirstAfterGift is true", async () => {
    const html = await sendWithNotice({
      kind: "loud",
      renewDate: "20 November 2026",
      amount: "€24",
      isFirstAfterGift: true,
      cancelUrl: "https://postpartumpost.com/billing?utm_content=renewal-notice",
    });
    expect(html).toContain(
      "This was your last free match from your gifted subscription! To keep matching, you'll be charged €24 on 20 November 2026."
    );
    expect(html).not.toContain("You've used all the matches in your bundle.");
    expect(html).toContain(">Billing page</a>");
  });

  // Bug fix, 2026-08-27: the Community Guidelines section and the loud
  // notice section both carry their own bottom padding by default, which
  // stacked into a visibly oversized gap between them (flagged from a
  // live screenshot) — tightBottom on the Guidelines section drops its
  // own padding only when a loud notice immediately follows it.
  it("tightens the spacing above the loud notice so the two sections don't stack padding", async () => {
    const html = await sendWithNotice({
      kind: "loud",
      renewDate: "20 November 2026",
      amount: "€24",
      isFirstAfterGift: false,
      cancelUrl: "https://postpartumpost.com/billing?utm_content=renewal-notice",
    });
    const guidelinesSectionIdx = html.indexOf("Community Guidelines");
    const paddingBeforeGuidelines = html.lastIndexOf('style="padding:0 24px', guidelinesSectionIdx);
    expect(html.slice(paddingBeforeGuidelines, paddingBeforeGuidelines + 30)).toContain("padding:0 24px 0px");
  });

  it("leaves the Community Guidelines section's normal bottom padding for a non-loud notice", async () => {
    const html = await sendWithNotice({ kind: "counter", matchesRemaining: 3 });
    const guidelinesSectionIdx = html.indexOf("Community Guidelines");
    const paddingBeforeGuidelines = html.lastIndexOf('style="padding:0 24px', guidelinesSectionIdx);
    expect(html.slice(paddingBeforeGuidelines, paddingBeforeGuidelines + 31)).toContain("padding:0 24px 16px");
  });

  it("defaults to no billing content when the caller passes nothing (back-compat)", async () => {
    await sendMatchRevealEmail(
      "recipient@example.test",
      "Robin",
      "Sam",
      "Sample",
      "sam@example.test",
      "coffee",
      "https://postpartumpost.com/matches/m1",
      "https://postpartumpost.com/matches",
    );
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain("Renews");
    expect(html).not.toContain("Manage your membership");
  });
});
