/**
 * Grants an existing, active member one free month — no coupon, no
 * checkout, no charge. Extends their subscription timeline directly via
 * Stripe (see lib/free-month-grants.ts for the mechanism per plan type).
 *
 * For new (not-yet-subscribed) recipients, use the gift card flow instead
 * (see __claude__/gift-card-flow.md) — this script is only for members who
 * already have an active subscription.
 *
 * Usage:
 *   yarn grant-free-month <email> <reason>              # live — .env.production
 *   yarn grant-free-month <email> <reason> --dry-run     # safe — .env.local (test-mode Stripe + your local/dev DB)
 *
 * Examples:
 *   yarn grant-free-month jane@example.com customer_service
 *   yarn grant-free-month amsterdamparentproject@gmail.com customer_service --dry-run
 *
 * `reason` is a free-text string tagged onto the Stripe subscription's
 * metadata (grant_reason) — use whatever's descriptive; not validated
 * against a fixed list.
 *
 * --dry-run loads .env.local instead of .env.production, so it hits
 * test-mode Stripe and whatever Supabase project .env.local points to —
 * nothing live is touched. The member/subscription you pass still has to
 * exist there (e.g. seed one for amsterdamparentproject@gmail.com first)
 * — this flag changes *where* the script points, it doesn't fake the
 * lookup.
 */

import { config } from "dotenv";
import { resolve } from "path";

const email = process.argv[2];
const reason = process.argv[3];
const dryRun = process.argv.includes("--dry-run");

if (!email || !reason) {
  console.error("Usage: yarn grant-free-month <email> <reason> [--dry-run]");
  process.exit(1);
}

const envFile = dryRun ? ".env.local" : ".env.production";
config({ path: resolve(process.cwd(), envFile) });

if (dryRun) {
  console.log(`DRY RUN — using ${envFile} (test-mode Stripe + your local/dev Supabase, nothing live touched)`);
}

const { grantFreeMonth } = await import("../lib/free-month-grants.ts");

try {
  const result = await grantFreeMonth(email, reason);

  console.log(`✓ Granted a free month to ${result.memberEmail} (reason: ${reason})`);
  console.log(`  Plan: ${result.plan}`);
  console.log(`  Next charge was: ${result.previousNextChargeDate.toISOString()}`);
  console.log(`  Next charge now: ${result.newNextChargeDate.toISOString()}`);
} catch (e: any) {
  console.error("✗ Failed:", e?.message);
  process.exit(1);
}
