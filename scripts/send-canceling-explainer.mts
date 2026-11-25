/**
 * One-off: emails every canceled member who still has rounds left, explaining
 * their options (use the rounds, end everything now, or resume). Send it
 * before the 1st, so the monthly opt-in email doesn't come as a surprise.
 *
 * Read-only against the database: there is no "already sent" marker, so run the
 * real send once. Use --dry-run first to see who would get it, and --only <email>
 * to send to one member (also the way to retry a failure).
 *
 * Usage:
 *   yarn canceling-explainer:test                    # .env.test, dry run only
 *   yarn canceling-explainer:prod --dry-run          # lists recipients, sends nothing
 *   yarn canceling-explainer:prod --only a@b.com     # sends to one member
 *   yarn canceling-explainer:prod                    # sends to every canceled member with rounds left
 *
 * The prod script sets NODE_ENV=production (package.json): subjectPrefix()
 * depends on it, so without it live emails get a test prefix.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { sendCancelingExplainers } from "../lib/canceling-explainer-send.ts";

const env = process.argv[2];
const args = process.argv.slice(3);
const dryRun = args.includes("--dry-run") || env === "test";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.trim().toLowerCase() : null;

if (env !== "test" && env !== "prod") {
  console.error("Usage: tsx scripts/send-canceling-explainer.mts <test|prod> [--dry-run] [--only <email>]");
  process.exit(1);
}

const envFile = env === "prod" ? ".env.production" : ".env.test";
if (env === "test") config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), envFile) });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}
if (!dryRun && process.env.NODE_ENV !== "production") {
  console.error("Refusing to send for real without NODE_ENV=production (use yarn canceling-explainer:prod).");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "postpartumpost" } });
const results = await sendCancelingExplainers(supabase as never, { dryRun, onlyEmail: only });

if (!results.length) {
  console.log(`No canceled members with rounds left${only ? ` matching ${only}` : ""}.`);
  process.exit(0);
}

console.log(`${dryRun ? "DRY RUN: " : ""}${results.length} canceled member(s) with rounds left\n`);
for (const r of results) {
  const mark = { would_send: "would send to", sent: "✓", failed: "✗" }[r.outcome];
  const detail = `${r.roundsLeft} round(s), canceled ${r.canceledAt ? r.canceledAt.slice(0, 10) : "(date not recorded)"}`;
  console.log(`${mark} ${r.email} (${detail})${r.error ? `: ${r.error}` : ""}`);
}
const failed = results.filter((r) => r.outcome === "failed").length;
if (!dryRun) console.log(`\nDone: ${results.length - failed} sent, ${failed} failed`);
process.exit(failed ? 1 : 0);
