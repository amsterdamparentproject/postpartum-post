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

  it("shows the counter line with 2+ matches remaining", async () => {
    const html = await sendWithNotice({ kind: "counter", matchesRemaining: 3 });
    expect(html).toContain("3 matches left");
    expect(html).not.toContain("Manage your membership");
  });

  it("shows the last-match copy at exactly 1, matching /billing's own wording", async () => {
    const html = await sendWithNotice({ kind: "counter", matchesRemaining: 1 });
    expect(html).toContain("Last match of your bundle.");
    expect(html).toContain("Renews after this one.");
  });

  it("shows the quiet monthly renewal line with no cancel CTA", async () => {
    const html = await sendWithNotice({ kind: "quiet", renewDate: "20 November 2026", amount: "€12" });
    expect(html).toContain("Renews 20 November 2026 — €12.");
    expect(html).not.toContain("Manage your membership");
  });

  it("omits the amount from the quiet line gracefully when unknown", async () => {
    const html = await sendWithNotice({ kind: "quiet", renewDate: "20 November 2026", amount: null });
    expect(html).toContain("Renews 20 November 2026.");
    expect(html).not.toContain("— null");
  });

  it("shows the loud end-of-bundle notice with date, amount, and a cancel link", async () => {
    const html = await sendWithNotice({
      kind: "loud",
      renewDate: "20 November 2026",
      amount: "€24",
      isFirstAfterGift: false,
      cancelUrl: "https://postpartumpost.com/billing?utm_content=renewal-notice",
    });
    expect(html).toContain("You've used all the matches in your bundle.");
    expect(html).toContain("€24");
    expect(html).toContain("20 November 2026");
    expect(html).toContain("Manage your membership");
    expect(html).toContain("https://postpartumpost.com/billing?utm_content=renewal-notice");
    expect(html).not.toContain("Your gift got you this far");
  });

  it("uses the gift-specific framing when isFirstAfterGift is true", async () => {
    const html = await sendWithNotice({
      kind: "loud",
      renewDate: "20 November 2026",
      amount: "€24",
      isFirstAfterGift: true,
      cancelUrl: "https://postpartumpost.com/billing?utm_content=renewal-notice",
    });
    expect(html).toContain("Your gift got you this far — that was your last free match.");
    expect(html).not.toContain("You've used all the matches in your bundle.");
    expect(html).toContain("Manage your membership");
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
