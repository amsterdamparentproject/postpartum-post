/**
 * Sends the "keep going?" email to comped cohort members whose free match is
 * used (matches_remaining at 0). Each email
 * carries two signed checkout links (1 round, 3 rounds) with the cohort's
 * Stripe promotion code applied. Prices and discount are read from Stripe.
 *
 * The monthly job (POST /api/send-continue-offers, n8n, the 27th) does the same
 * thing automatically; this script is for running it by hand, e.g. to send
 * early or to one person. Both share lib/continue-offer-send.ts and the
 * members.continue_offer_sent_at marker (migration 035), so nobody is emailed
 * twice, whichever of the two runs first.
 *
 * Use --dry-run first to see who would get it, and --only <email> to send to
 * one member. To re-send to someone already sent, clear their
 * continue_offer_sent_at in the SQL editor first.
 *
 * Usage:
 *   yarn cohort-continue:test                       # .env.test, dry run only
 *   yarn cohort-continue:prod --dry-run             # lists recipients, sends nothing
 *   yarn cohort-continue:prod --only a@b.com        # sends to one member
 *   yarn cohort-continue:prod                       # sends to every eligible member
 *   add --cohort <slug> to pick another cohort (default: every cohort with an offer)
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { sendContinueOffers } from "../lib/continue-offer-send.ts";
import { sendGiftedContinueOffers } from "../lib/gifted-continue-send.ts";
import { STRIPE_API_VERSION } from "../lib/stripe.ts";

const env = process.argv[2];
const args = process.argv.slice(3);
const dryRun = args.includes("--dry-run") || env === "test";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.trim().toLowerCase() : null;
const slug = args.includes("--cohort") ? args[args.indexOf("--cohort") + 1] : undefined;

if (env !== "test" && env !== "prod") {
  console.error("Usage: tsx scripts/send-cohort-continue.mts <test|prod> [--dry-run] [--only <email>] [--cohort <slug>]");
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
const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "postpartumpost" } });

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error(`Missing STRIPE_SECRET_KEY in ${envFile}`);
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
const results = await sendContinueOffers(supabase, { stripe, siteUrl, dryRun, cohortSlug: slug, onlyEmail: only });
// Comped members with no cohort offer (gifted, or a cohort without a code) get the regular-price version, listed as "regular-price".
if (!slug) results.push(...(await sendGiftedContinueOffers(supabase, { stripe, siteUrl, dryRun, onlyEmail: only })));

if (!results.length) {
  console.log(`No cohort with a continue offer found${slug ? ` for "${slug}"` : ""}. Set continue_promo_code_id on the cohort first.`);
  process.exit(0);
}

let failed = 0;
for (const r of results) {
  console.log(`\n${dryRun ? "DRY RUN: " : ""}cohort "${r.slug}"`);
  if (r.status === "offer_unavailable") {
    console.error("  The promotion code is inactive, has no coupon, or a plan price is missing in Stripe. Nothing sent.");
    failed++;
    continue;
  }
  console.log(`  ${r.eligible} comped member(s) at 0 not yet sent the offer`);
  for (const m of r.members) {
    const mark = { would_send: "would send to", sent: "✓", failed: "✗", skipped_already_claimed: "skipped (already claimed)" }[m.outcome];
    console.log(`  ${mark} ${m.email}`);
  }
  if (!dryRun) console.log(`  Done: ${r.sent} sent, ${r.failed} failed`);
  failed += r.failed;
}
process.exit(failed ? 1 : 0);
