/**
 * One-off script — sends the "one week left to meet up" reminder to both
 * members of every active match in the current month's round.
 *
 * A match is skipped if:
 *   - a rematch was requested for it (partner info was already removed), or
 *   - it's flagged for review (safety concern), or
 *   - either member's status is no longer 'active' (paused/inactive/canceled since matching)
 *
 * The "Tell us how it went" button links to /feedback via a Supabase magic
 * link, since that page is scoped to logged-in members — clicking it signs
 * the recipient straight in instead of dropping them at a sign-in prompt.
 *
 * Usage:
 *   yarn meetup-reminder:test              # runs against .env.test (amsterdamparentproject@gmail.com only)
 *   yarn meetup-reminder:prod              # sends to all current matches
 *   yarn meetup-reminder:prod --dry-run    # prod DB + Resend, but only sends to amsterdamparentproject@gmail.com
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { sendMeetupReminderEmail } from "../lib/emails/meetup-reminder.ts";
import { currentMonth, monthToDate } from "../lib/tokens.ts";

const env = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (env !== "test" && env !== "prod") {
  console.error("Usage: npx tsx scripts/send-meetup-reminder.mts <test|prod> [--dry-run]");
  process.exit(1);
}

const envFile = env === "prod" ? ".env.production" : ".env.test";
if (env === "test") {
  // Load .env.local first so RESEND_API_KEY takes precedence over the placeholder in .env.test
  config({ path: resolve(process.cwd(), ".env.local") });
}
config({ path: resolve(process.cwd(), envFile) });

const TEST_EMAIL = "amsterdamparentproject@gmail.com";
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
const FEEDBACK_URL = `${SITE_URL}/feedback`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
};

/** Magic link straight to /feedback; falls back to a plain link if generation fails. */
async function feedbackMagicLink(email: string): Promise<string> {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: FEEDBACK_URL },
    });
    if (!error && data?.properties?.action_link) {
      return data.properties.action_link;
    }
  } catch (err) {
    console.error("[send-meetup-reminder] generateLink failed for", email, err);
  }
  return FEEDBACK_URL;
}

const monthDate = monthToDate(currentMonth());

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

if (dryRun) console.log("DRY RUN — sending to amsterdamparentproject@gmail.com only");

if (error) {
  console.error("Failed to fetch matches:", error.message);
  process.exit(1);
}

if (!matches?.length) {
  console.log(`No active matches found for ${monthDate}.`);
  process.exit(0);
}

console.log(`Found ${matches.length} active match(es) for ${monthDate}.`);

let sent = 0;
let failed = 0;
let skipped = 0;

for (const match of matches) {
  const m1 = (Array.isArray(match.member1) ? match.member1[0] : match.member1) as MemberRow | null;
  const m2 = (Array.isArray(match.member2) ? match.member2[0] : match.member2) as MemberRow | null;

  if (!m1 || !m2) {
    console.error(`✗ Match ${match.id}: missing member data`);
    failed++;
    continue;
  }

  if (m1.status !== "active" || m2.status !== "active") {
    console.log(`- Match ${match.id}: skipped (${m1.first_name} status=${m1.status}, ${m2.first_name} status=${m2.status})`);
    skipped++;
    continue;
  }

  const recipients: [MemberRow, MemberRow][] = [
    [m1, m2],
    [m2, m1],
  ];

  for (const [recipient, partner] of recipients) {
    if ((env === "test" || dryRun) && recipient.email !== TEST_EMAIL) continue;
    try {
      const feedbackUrl = await feedbackMagicLink(recipient.email);
      await sendMeetupReminderEmail(recipient.email, recipient.first_name, partner.first_name, partner.email, feedbackUrl);
      console.log(`✓ ${recipient.email} (match with ${partner.first_name})`);
      sent++;
    } catch (e: unknown) {
      console.error(`✗ ${recipient.email}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }
}

console.log(`\nDone: ${sent} sent, ${skipped} match(es) skipped, ${failed} failed`);
