/**
 * One-off script — sends the member update email to all active members.
 *
 * Usage:
 *   yarn member-update:test              # runs against .env.test (amsterdamparentproject@gmail.com only)
 *   yarn member-update:prod              # sends to all active members
 *   yarn member-update:prod --dry-run    # prod DB + Resend, but only sends to amsterdamparentproject@gmail.com
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { sendMemberUpdateEmail } from "../lib/emails/member-update.ts";

const env = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (env !== "test" && env !== "prod") {
  console.error("Usage: npx tsx scripts/send-member-update.ts <test|prod> [--dry-run]");
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

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

const query = supabase.from("members").select("id, email, first_name").in("status", ["active", "canceling"]);
if (env === "test" || dryRun) query.eq("email", "amsterdamparentproject@gmail.com");
const { data: members, error } = await query;

if (dryRun) console.log("DRY RUN — sending to amsterdamparentproject@gmail.com only");

if (error) {
  console.error("Failed to fetch members:", error.message);
  process.exit(1);
}

if (!members?.length) {
  console.log("No members found.");
  process.exit(0);
}

console.log(`Sending to ${members.length} member(s)...`);

let sent = 0;
let failed = 0;

for (const member of members) {
  try {
    await sendMemberUpdateEmail(member.email, member.first_name, member.id);
    console.log(`✓ ${member.email}`);
    sent++;
  } catch (e: any) {
    console.error(`✗ ${member.email}:`, e?.message);
    failed++;
  }
}

console.log(`\nDone: ${sent} sent, ${failed} failed`);
