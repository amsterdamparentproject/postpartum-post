/**
 * Shared logic for the "one week left to meet up" reminder — used by both
 * scripts/send-meetup-reminder.mts (manual/local runs) and
 * POST /api/send-meetup-reminder (n8n's daily cron trigger), so the
 * eligibility rules and send logic live in exactly one place.
 */

import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { sendMeetupReminderEmail } from "@/lib/emails";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
const FEEDBACK_URL = `${SITE_URL}/feedback`;
const FEEDBACK_CONFIRM_URL = `${SITE_URL}/auth/confirm?next=${encodeURIComponent("/feedback")}`;

/** Statuses still eligible for the reminder — 'canceling' keeps access through period end. */
const ELIGIBLE_STATUSES = ["active", "canceling"];

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Magic link through /auth/confirm?next=/feedback; falls back to a plain
 * /feedback link (no auto sign-in) if generation fails.
 *
 * Built from hashed_token + type ourselves (postpartumpost.com/auth/confirm),
 * rather than using the returned action_link directly — action_link points
 * at <project-ref>.supabase.co/auth/v1/verify first, which is a working
 * link but shows the raw Supabase project URL in the email before it
 * redirects. Same reasoning as verifyMagicLinkToken's docblock in
 * lib/auth-confirm.ts, applied here for the admin.generateLink caller too.
 */
async function feedbackMagicLink(supabase: AdminClient, email: string): Promise<string> {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: FEEDBACK_CONFIRM_URL },
    });
    const hashedToken = data?.properties?.hashed_token;
    if (!error && hashedToken) {
      const next = encodeURIComponent("/feedback");
      return `${SITE_URL}/auth/confirm?token_hash=${hashedToken}&type=magiclink&next=${next}`;
    }
  } catch (err) {
    console.error("[meetup-reminder] generateLink failed for", email, err);
  }
  return FEEDBACK_URL;
}

export type MeetupReminderMatchResult =
  | { matchId: string; status: "sent"; recipients: string[] }
  | { matchId: string; status: "skipped"; reason: string }
  | { matchId: string; status: "failed"; reason: string };

export type MeetupReminderResult = {
  month: string;
  totalMatches: number;
  sent: number;
  skipped: number;
  failed: number;
  details: MeetupReminderMatchResult[];
};

/**
 * Sends the "one week left to meet up" reminder to both members of every
 * eligible match in the current month's round.
 *
 * A match is skipped if a rematch was requested, it's flagged for review, or
 * either member's status isn't active/canceling.
 *
 * @param testEmail  If set, only sends to this address (every other
 *   recipient in an eligible match is silently skipped) — used for test and
 *   dry-run sends without touching real members' inboxes.
 * @param monthOverride  YYYY-MM to target instead of the real current month —
 *   same override convention as /api/send-match-emails, /api/commit-matches,
 *   and /api/run-matcher, so integration tests can seed matches against a
 *   safe sentinel month instead of racing whatever "today" happens to be.
 */
export async function runMeetupReminder(testEmail?: string, monthOverride?: string): Promise<MeetupReminderResult> {
  const supabase = createAdminClient();
  const month = monthOverride ?? currentMonth();
  const monthDate = monthToDate(month);

  const { data: matches, error } = await supabase
    .from("matches")
    .select(`
      id,
      member1:member_id_1 ( id, first_name, last_name, email, status ),
      member2:member_id_2 ( id, first_name, last_name, email, status )
    `)
    .eq("matched_on", monthDate)
    .eq("rematch_requested", false)
    .eq("flagged_for_review", false);

  if (error) {
    throw new Error(`Failed to fetch matches: ${error.message}`);
  }

  const result: MeetupReminderResult = {
    month,
    totalMatches: matches?.length ?? 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const match of matches ?? []) {
    const m1 = (Array.isArray(match.member1) ? match.member1[0] : match.member1) as MemberRow | null;
    const m2 = (Array.isArray(match.member2) ? match.member2[0] : match.member2) as MemberRow | null;

    if (!m1 || !m2) {
      result.failed++;
      result.details.push({ matchId: match.id, status: "failed", reason: "missing member data" });
      continue;
    }

    if (!ELIGIBLE_STATUSES.includes(m1.status) || !ELIGIBLE_STATUSES.includes(m2.status)) {
      result.skipped++;
      result.details.push({
        matchId: match.id,
        status: "skipped",
        reason: `${m1.first_name} status=${m1.status}, ${m2.first_name} status=${m2.status}`,
      });
      continue;
    }

    const recipients: [MemberRow, MemberRow][] = [
      [m1, m2],
      [m2, m1],
    ];

    const sentTo: string[] = [];
    let matchFailed = false;

    for (const [recipient, partner] of recipients) {
      if (testEmail && recipient.email !== testEmail) continue;
      try {
        const feedbackUrl = await feedbackMagicLink(supabase, recipient.email);
        await sendMeetupReminderEmail(recipient.email, recipient.first_name, partner.first_name, partner.email, feedbackUrl);
        sentTo.push(recipient.email);
        result.sent++;
      } catch (e: unknown) {
        matchFailed = true;
        result.failed++;
        result.details.push({
          matchId: match.id,
          status: "failed",
          reason: `${recipient.email}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    if (sentTo.length && !matchFailed) {
      result.details.push({ matchId: match.id, status: "sent", recipients: sentTo });
    }
  }

  return result;
}
