/**
 * One-off script — sends the monthly opt-in email to members who joined
 * within a specific date range (e.g. new signups since general enrollment
 * opened, who missed the regular 1st-of-month n8n opt-in send).
 *
 * Usage:
 *   npx tsx scripts/send-optin-new-members.mts test  --from 2026-07-01 --to 2026-07-03
 *   npx tsx scripts/send-optin-new-members.mts prod --from 2026-07-01 --to 2026-07-03
 *   npx tsx scripts/send-optin-new-members.mts prod --from 2026-07-01 --to 2026-07-03 --dry-run
 *
 * --from/--to are inclusive calendar days, interpreted in UTC against
 * members.created_at. --dry-run queries the real prod DB (so the eligible
 * list is accurate) but redirects every send to amsterdamparentproject@gmail.com
 * instead of the real member.
 *
 * Prints the eligible member list (id, name, join date) and asks for a
 * Y/N confirmation before sending anything.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createInterface } from "readline/promises";
import { createClient } from "@supabase/supabase-js";
import { generateOptinToken } from "../lib/optin-token.ts";
import { currentMonth } from "../lib/tokens.ts";
import { sendOptinEmail } from "../lib/emails/optin.ts";

const env = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const from = argValue("--from");
const to = argValue("--to");

if (env !== "test" && env !== "prod") {
  console.error("Usage: npx tsx scripts/send-optin-new-members.mts <test|prod> --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run]");
  process.exit(1);
}
if (!from || !to) {
  console.error("Missing --from / --to (format: YYYY-MM-DD)");
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

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
const TEST_EMAIL = "amsterdamparentproject@gmail.com";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

// `to` is treated as an inclusive end-of-day boundary.
const toExclusive = new Date(`${to}T00:00:00.000Z`);
toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

const query = supabase
  .from("members")
  .select("id, first_name, last_name, email, created_at")
  .in("status", ["active", "canceling"])
  .gte("created_at", `${from}T00:00:00.000Z`)
  .lt("created_at", toExclusive.toISOString())
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
  console.log(`No members joined between ${from} and ${to}.`);
  process.exit(0);
}

// -------------------------------------------------------------------------
// Show who's eligible and get explicit confirmation before sending anything.
// -------------------------------------------------------------------------
console.log(`\nEligible members (joined ${from}–${to}):\n`);
for (const m of members) {
  console.log(`  ${m.id}  ${m.first_name} ${m.last_name}  joined ${m.created_at}`);
}
console.log(`\n${members.length} member(s) total.`);

const confirmPrompt = dryRun
  ? `\nSend opt-in email to ${TEST_EMAIL} (${members.length} test send${members.length === 1 ? "" : "s"}, redirected from the members above)? (Y/N) `
  : "\nSend opt-in email to these members? (Y/N) ";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(confirmPrompt);
rl.close();

if (answer.trim().toLowerCase() !== "y") {
  console.log("Aborted — no emails sent.");
  process.exit(0);
}

console.log(`\nSending opt-in email to ${members.length} member(s) who joined ${from}–${to}...`);

const month = currentMonth(); // YYYY-MM
let sent = 0;
let failed = 0;

for (const member of members) {
  const buildUrl = (action: "coffee" | "playdate" | "skip") => {
    const token = generateOptinToken(member.id, month, action);
    return `${SITE_URL}/api/optin?member=${member.id}&month=${month}&action=${action}&token=${token}`;
  };

  const recipient = dryRun ? TEST_EMAIL : member.email;

  try {
    await sendOptinEmail(
      recipient,
      member.first_name,
      buildUrl("coffee"),
      buildUrl("playdate"),
      buildUrl("skip")
    );
    console.log(`✓ ${member.email}${dryRun ? ` → sent to ${TEST_EMAIL}` : ""} (joined ${member.created_at})`);
    sent++;
  } catch (e: any) {
    console.error(`✗ ${member.email}:`, e?.message);
    failed++;
  }
}

console.log(`\nDone: ${sent} sent, ${failed} failed`);
