/**
 * One-off script — sends the "one week left to meet up" reminder to both
 * members of every eligible match in the current month's round.
 *
 * Eligibility rules, magic-link generation, and the send loop all live in
 * lib/meetup-reminder.ts (shared with POST /api/send-meetup-reminder, the
 * route n8n's daily cron calls) — this file only handles env selection and
 * console output for a human running it manually.
 *
 * Usage:
 *   yarn meetup-reminder:test              # runs against .env.test (amsterdamparentproject@gmail.com only)
 *   yarn meetup-reminder:prod              # sends to all current matches
 *   yarn meetup-reminder:prod --dry-run    # prod DB + Resend, but only sends to amsterdamparentproject@gmail.com
 */

import { config } from "dotenv";
import { resolve } from "path";

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

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

// Imported after dotenv config runs, so lib/supabase.ts's createAdminClient()
// picks up the right env vars for the chosen environment.
const { runMeetupReminder } = await import("../lib/meetup-reminder.ts");

if (dryRun) console.log("DRY RUN — sending to amsterdamparentproject@gmail.com only");

const result = await runMeetupReminder(env === "test" || dryRun ? TEST_EMAIL : undefined);

if (result.totalMatches === 0) {
  console.log(`No active matches found for ${result.month}.`);
  process.exit(0);
}

console.log(`Found ${result.totalMatches} active match(es) for ${result.month}.`);

for (const detail of result.details) {
  if (detail.status === "sent") {
    for (const email of detail.recipients) {
      console.log(`✓ ${email}`);
    }
  } else if (detail.status === "skipped") {
    console.log(`- Match ${detail.matchId}: skipped (${detail.reason})`);
  } else {
    console.error(`✗ Match ${detail.matchId}: ${detail.reason}`);
  }
}

console.log(`\nDone: ${result.sent} sent, ${result.skipped} match(es) skipped, ${result.failed} failed`);
