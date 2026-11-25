import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ data: { id: "email_test" }, error: null }),
}));
vi.mock("@/lib/resend", () => ({ getResend: () => ({ emails: { send: mockSend } }) }));

import { sendCancelingExplainerEmail } from "@/lib/emails/canceling-explainer";

async function html(rounds: number, canceledAt: string | null = null): Promise<string> {
  mockSend.mockClear();
  await sendCancelingExplainerEmail("r@example.test", "Robin", rounds, canceledAt);
  return mockSend.mock.calls[0][0].html as string;
}

describe("canceling explainer email", () => {
  beforeEach(() => mockSend.mockClear());

  it("greets the member and explains the canceled state and the rounds left", async () => {
    const h = await html(3);
    expect(h).toContain("Hi Robin,");
    expect(h).toContain("Alex here");
    expect(h).toContain("You canceled your Postpartum Post membership, so you won't be charged again.");
    expect(h).toContain("You still have 3 rounds left that you've already paid for");
    expect(h).toContain("<b>If you want to keep using your rounds</b>");
    expect(h).toContain("<b>end everything now</b>");
    expect(h).toContain("canceled but with rounds left");
    expect(h).toContain("until they're used");
    expect(h).toContain("when your rounds run out");
  });

  it("says when they canceled if the date is known, and leaves it out otherwise", async () => {
    expect(await html(3, "2026-11-12T10:00:00Z")).toContain("membership on 12 November 2026, so you won't be charged again");
    expect(await html(3)).toContain("membership, so you won't be charged again");
  });

  it("uses the singular for one round", async () => {
    const h = await html(1);
    expect(h).toContain("You still have 1 round left");
    expect(h).toContain("forfeits your remaining round.");
    expect(h).toContain("<b>If you want to keep using your round</b>");
    expect(h).toContain("until it's used");
    expect(h).toContain("when your round runs out");
    expect(h).toContain("canceled but with a round left");
    expect(h).not.toContain("rounds");
  });

  it("uses the agreed subject", async () => {
    await html(2);
    expect(mockSend.mock.calls[0][0].subject).toContain("Postpartum Post: Update on your canceling membership");
  });

  it("tells them they can resume from Billing", async () => {
    expect(await html(2)).toContain("You can resume your membership from");
  });

  it("has an end-everything button that opens the dialog, with its own utm_content", async () => {
    const h = await html(2);
    expect(h).toContain("utm_content=canceling-explainer-end&end=1");
    expect(h).toContain("utm_content=canceling-explainer\"");
  });
});
