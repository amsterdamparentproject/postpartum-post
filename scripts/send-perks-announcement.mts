/**
 * One-off script — sends the Post Perks announcement (lib/emails/perks-announcement.ts)
 * to all active/canceling members.
 *
 * Usage:
 *   yarn perks-announcement:test              # .env.test DB; only amsterdamparentproject@gmail.com
 *   yarn perks-announcement:prod --dry-run    # prod DB + Resend, but ONLY sends to amsterdamparentproject@gmail.com
 *   yarn perks-announcement:prod              # sends to every active/canceling member, after a Y/N confirmation
 *
 * Prints the recipient count and asks for explicit Y/N confirmation before
 * any live send. Nothing is ever sent without it.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createInterface } from "readline/promises";
import { createClient } from "@supabase/supabase-js";
import { sendPerksAnnouncementEmail } from "../lib/emails/perks-announcement.ts";

const env = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const TEST_EMAIL = "amsterdamparentproject@gmail.com";

if (env !== "test" && env !== "prod") {
  console.error("Usage: tsx scripts/send-perks-announcement.mts <test|prod> [--dry-run]");
  process.exit(1);
}

const envFile = env === "prod" ? ".env.production" : ".env.test";
if (env === "test") {
  // Load .env.local first so RESEND_API_KEY takes precedence over the placeholder in .env.test
  config({ path: resolve(process.cwd(), ".env.local") });
}
config({ path: resolve(process.cwd(), envFile) });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "postpartumpost" } });

const query = supabase
  .from("members")
  .select("id, email, first_name")
  .in("status", ["active", "canceling"])
  .order("created_at", { ascending: true });
if (env === "test" || dryRun) query.eq("email", TEST_EMAIL);
const { data: members, error } = await query;

if (error) {
  console.error("Failed to fetch members:", error.message);
  process.exit(1);
}
if (!members?.length) {
  console.log("No members found.");
  process.exit(0);
}

if (dryRun) console.log(`DRY RUN — sending to ${TEST_EMAIL} only`);

// Explicit confirmation before any send that reaches real members.
if (env === "prod" && !dryRun) {
  console.log(`\nAbout to send the Post Perks announcement to ${members.length} member(s).`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Send to ALL of them? (Y/N) ");
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted — no emails sent.");
    process.exit(0);
  }
}

console.log(`Sending to ${members.length} member(s)...`);

let sent = 0;
let failed = 0;

for (const member of members) {
  try {
    await sendPerksAnnouncementEmail(member.email, member.first_name);
    console.log(`✓ ${member.email}`);
    sent++;
  } catch (e) {
    console.error(`✗ ${member.email}:`, e instanceof Error ? e.message : String(e));
    failed++;
  }
}

console.log(`\nDone: ${sent} sent, ${failed} failed`);
