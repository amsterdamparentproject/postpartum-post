import type { createAdminClient } from "@/lib/supabase";
import { sendCancelingExplainerEmail } from "@/lib/emails/canceling-explainer";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ExplainerOutcome = "would_send" | "sent" | "failed";
export type ExplainerResult = {
  email: string;
  roundsLeft: number;
  /** ISO timestamp, or null when it wasn't recorded (canceled before members.canceled_at existed). */
  canceledAt: string | null;
  outcome: ExplainerOutcome;
  error?: string;
};

/**
 * One-off: explains their options to every member who canceled but still has
 * rounds left (the same people who keep getting the monthly opt-in email).
 * Read-only against the database: there is no "already sent" marker, so run it
 * once, and use onlyEmail to retry a single address.
 */
export async function sendCancelingExplainers(
  supabase: AdminClient,
  opts: { dryRun?: boolean; onlyEmail?: string | null; send?: typeof sendCancelingExplainerEmail } = {}
): Promise<ExplainerResult[]> {
  const send = opts.send ?? sendCancelingExplainerEmail;
  const { data: members, error } = await supabase
    .from("members")
    .select("email, first_name, matches_remaining, canceled_at")
    .eq("status", "canceling")
    .gt("matches_remaining", 0)
    .order("email");
  if (error) throw new Error(`members query failed: ${error.message}`);

  const wanted = opts.onlyEmail ? (members ?? []).filter((m) => m.email.toLowerCase() === opts.onlyEmail!.toLowerCase()) : (members ?? []);
  if (!wanted.length) return [];

  const results: ExplainerResult[] = [];
  for (const m of wanted) {
    const base = {
      email: m.email,
      roundsLeft: m.matches_remaining as number,
      canceledAt: (m.canceled_at as string | null) ?? null,
    };
    if (opts.dryRun) {
      results.push({ ...base, outcome: "would_send" });
      continue;
    }
    try {
      await send(m.email, m.first_name ?? "there", base.roundsLeft, base.canceledAt);
      results.push({ ...base, outcome: "sent" });
    } catch (e) {
      results.push({ ...base, outcome: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
