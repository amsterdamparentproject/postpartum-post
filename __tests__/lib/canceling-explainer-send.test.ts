/**
 * Integration tests for the one-off "canceled with rounds left" explainer:
 * who gets it, and whether they're told they can resume or rejoin. The send
 * function is injected, so no email goes out. Read-only against the database.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { sendCancelingExplainers } from "@/lib/canceling-explainer-send";

const seeded: string[] = [];
async function seed(overrides: Parameters<typeof seedMember>[0]) {
  const m = await seedMember(overrides);
  seeded.push(m.id);
  return m;
}

afterEach(async () => {
  await Promise.all(seeded.splice(0).map(cleanupMember));
});

describe("sendCancelingExplainers", () => {
  it("picks only canceled members with rounds left", async () => {
    const withRounds = await seed({ status: "canceling", matches_remaining: 2 });
    const noRounds = await seed({ status: "canceling", matches_remaining: 0 });
    const active = await seed({ status: "active", matches_remaining: 3 });
    const inactive = await seed({ status: "inactive", matches_remaining: 0 });

    const results = await sendCancelingExplainers(createTestSupabase() as never, { dryRun: true });
    const byEmail = new Map(results.map((r) => [r.email, r]));

    expect(byEmail.get(withRounds.email)).toMatchObject({ roundsLeft: 2, outcome: "would_send" });
    for (const m of [noRounds, active, inactive]) expect(byEmail.has(m.email)).toBe(false);
  });

  it("passes along when they canceled, or null when it wasn't recorded", async () => {
    const dated = await seed({ status: "canceling", matches_remaining: 1 });
    await createTestSupabase().from("members").update({ canceled_at: "2026-11-12T10:00:00Z" }).eq("id", dated.id);
    const undated = await seed({ status: "canceling", matches_remaining: 1 });
    const send = vi.fn().mockResolvedValue(undefined);

    await sendCancelingExplainers(createTestSupabase() as never, { onlyEmail: dated.email, send });
    await sendCancelingExplainers(createTestSupabase() as never, { onlyEmail: undated.email, send });
    expect(send).toHaveBeenNthCalledWith(1, dated.email, expect.any(String), 1, "2026-11-12T10:00:00+00:00");
    expect(send).toHaveBeenNthCalledWith(2, undated.email, expect.any(String), 1, null);
  });

  it("sends nothing on a dry run, and sends with the right arguments otherwise", async () => {
    const m = await seed({ status: "canceling", matches_remaining: 2, first_name: "Robin" });
    const send = vi.fn().mockResolvedValue(undefined);

    await sendCancelingExplainers(createTestSupabase() as never, { dryRun: true, onlyEmail: m.email, send });
    expect(send).not.toHaveBeenCalled();

    const results = await sendCancelingExplainers(createTestSupabase() as never, { onlyEmail: m.email.toUpperCase(), send });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(m.email, "Robin", 2, null);
    expect(results).toEqual([expect.objectContaining({ email: m.email, outcome: "sent" })]);
  });

  it("records a failed send and carries on", async () => {
    const m = await seed({ status: "canceling", matches_remaining: 1 });
    const send = vi.fn().mockRejectedValue(new Error("resend down"));
    const [r] = await sendCancelingExplainers(createTestSupabase() as never, { onlyEmail: m.email, send });
    expect(r).toMatchObject({ outcome: "failed", error: "resend down" });
  });
});
