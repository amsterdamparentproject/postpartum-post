/**
 * Sends the "keep going?" email to comped cohort members whose free match is
 * used (matches_remaining at 0). Each email carries two signed checkout links
 * (1 round, 3 rounds) with the cohort's Stripe promotion code applied. Prices and
 * discount are read from Stripe.
 *
 * There is no "already sent" marker, so run it once per batch. Use --dry-run
 * first to see who would get it, and --only <email> to send to one member.
 *
 * Usage:
 *   yarn cohort-continue:test                       # .env.test, dry run only
 *   yarn cohort-continue:prod --dry-run             # lists recipients, sends nothing
 *   yarn cohort-continue:prod --only a@b.com        # sends to one member
 *   yarn cohort-continue:prod                       # sends to every eligible member
 *   add --cohort <slug> to pick another cohort (default: dsa)
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { sendCohortContinueEmail } from "../lib/emails/continue-cohort.ts";
import { generateContinueToken } from "../lib/tokens.ts";
import { loadContinueOffer } from "../lib/continue-offer-pricing.ts";

const env = process.argv[2];
const args = process.argv.slice(3);
const dryRun = args.includes("--dry-run") || env === "test";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.trim().toLowerCase() : null;
const slug = args.includes("--cohort") ? args[args.indexOf("--cohort") + 1] : "dsa";

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

const { data: cohort, error: cohortError } = await supabase
  .from("cohorts")
  .select("slug, name, continue_promo_code_id")
  .eq("slug", slug)
  .maybeSingle();
if (cohortError || !cohort) {
  console.error(`Cohort "${slug}" not found:`, cohortError?.message ?? "no row");
  process.exit(1);
}
if (!cohort.continue_promo_code_id) {
  console.error(`Cohort "${slug}" has no continue_promo_code_id yet. Create the coupon in Stripe and set it first.`);
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error(`Missing STRIPE_SECRET_KEY in ${envFile}`);
  process.exit(1);
}
const offer = await loadContinueOffer(new Stripe(stripeKey), cohort.continue_promo_code_id);
if (!offer) {
  console.error(`The promotion code ${cohort.continue_promo_code_id} is inactive, has no coupon, or a plan price is missing in Stripe.`);
  process.exit(1);
}
console.log(`Offer: ${offer.discountText}; ${offer.plans.map((p) => `${p.label} ${p.offerCents / 100} (was ${p.regularCents / 100})`).join(", ")}`);

let query = supabase
  .from("members")
  .select("id, email, first_name")
  .eq("cohort", slug)
  .in("billing_mode", ["comped_no_perks", "comped_with_perks"])
  .eq("status", "active")
  .lte("matches_remaining", 0);
if (only) query = query.eq("email", only);
const { data: members, error } = await query;
if (error) {
  console.error("Failed to fetch members:", error.message);
  process.exit(1);
}
if (!members?.length) {
  console.log("No eligible members found.");
  process.exit(0);
}

const link = (memberId: string, plan: string) =>
  `${siteUrl}/api/continue?member_id=${memberId}&plan=${plan}&token=${generateContinueToken(memberId, plan)}`;

console.log(`${dryRun ? "DRY RUN: " : ""}${members.length} member(s) in "${cohort.name}":`);
let sent = 0;
let failed = 0;
for (const member of members) {
  if (dryRun) {
    console.log(`  would send to ${member.email}`);
    continue;
  }
  try {
    await sendCohortContinueEmail(
      member.email,
      member.first_name ?? "there",
      cohort.name,
      link(member.id, "standard_monthly"),
      link(member.id, "commitment_3mo"),
      offer
    );
    console.log(`✓ ${member.email}`);
    sent++;
  } catch (e) {
    console.error(`✗ ${member.email}:`, e instanceof Error ? e.message : String(e));
    failed++;
  }
}
if (!dryRun) console.log(`\nDone: ${sent} sent, ${failed} failed`);
