/**
 * One-off script — sends a "match starts tomorrow, finish signing up if you
 * want in" follow-up to members stuck in "pending" status (abandoned
 * checkout or failed payment — never completed signup).
 *
 * Usage:
 *   yarn pending-followup:test
 *   yarn pending-followup:prod
 *   yarn pending-followup:prod --dry-run
 *
 * --dry-run queries the real prod DB (so the eligible list is accurate) but
 * redirects every send to amsterdamparentproject@gmail.com instead of the
 * real member.
 *
 * Prints the eligible member list (id, name, email) and asks for a Y/N
 * confirmation before sending anything.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createInterface } from "readline/promises";
import { createClient } from "@supabase/supabase-js";
import { sendPendingFollowupEmail } from "../lib/emails/pending-followup.ts";

const env = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (env !== "test" && env !== "prod") {
  console.error("Usage: npx tsx scripts/send-pending-followup.mts <test|prod> [--dry-run]");
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

const TEST_EMAIL = "amsterdamparentproject@gmail.com";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

const query = supabase
  .from("members")
  .select("id, first_name, last_name, email, created_at")
  .eq("status", "pending")
  .order("created_at", { ascending: true });

// .env.test points at an isolated test DB, so it's fine to scope that down too.
// --dry-run runs against the real prod DB — we want the *real* eligible list,
// we just redirect where the email actually gets delivered (see send loop below).
if (env === "test") query.eq("email", TEST_EMAIL);

const { data: members, error } = await query;

if (dryRun) console.log(`DRY RUN — matching against real prod data, but all sends will be redirected to ${TEST_EMAIL}`);

if (error) {
  console.error("Failed to fetch members:", error.message);
  process.exit(1);
}

if (!members?.length) {
  console.log("No pending members found.");
  process.exit(0);
}

// -------------------------------------------------------------------------
// Show who's eligible and get explicit confirmation before sending anything.
// -------------------------------------------------------------------------
console.log(`\nPending members:\n`);
for (const m of members) {
  console.log(`  ${m.id}  ${m.first_name} ${m.last_name}  ${m.email}  joined ${m.created_at}`);
}
console.log(`\n${members.length} member(s) total.`);

const confirmPrompt = dryRun
  ? `\nSend follow-up email to ${TEST_EMAIL} (${members.length} test send${members.length === 1 ? "" : "s"}, redirected from the members above)? (Y/N) `
  : "\nSend follow-up email to these members? (Y/N) ";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(confirmPrompt);
rl.close();

if (answer.trim().toLowerCase() !== "y") {
  console.log("Aborted — no emails sent.");
  process.exit(0);
}

console.log(`\nSending follow-up email to ${members.length} pending member(s)...`);

let sent = 0;
let failed = 0;

for (const member of members) {
  const recipient = dryRun ? TEST_EMAIL : member.email;

  try {
    await sendPendingFollowupEmail(recipient, member.first_name, member.last_name, member.email);
    console.log(`✓ ${member.email}${dryRun ? ` → sent to ${TEST_EMAIL}` : ""}`);
    sent++;
  } catch (e: any) {
    console.error(`✗ ${member.email}:`, e?.message);
    failed++;
  }
}

console.log(`\nDone: ${sent} sent, ${failed} failed`);
