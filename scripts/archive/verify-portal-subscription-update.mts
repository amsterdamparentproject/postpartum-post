/**
 * Read-only check for Track C3 (billing-simplification-plan.md).
 *
 * The Stripe customer portal's default configuration has
 * subscription_update enabled with trial_update_behavior: "end_trial" —
 * any of the members currently sitting in Stripe's "trialing" status
 * (see lib/subscription-utils.ts's extendSubscriptionToNext5th, and
 * Appendix A of the plan) who opens the portal and touches the "update
 * plan" flow ends their own trial and is charged immediately. C3 is
 * turning that feature off in the Dashboard — this script only reads the
 * configuration back and reports whether that's actually taken effect.
 * It never writes anything.
 *
 * getCustomerPortalUrl() (app/actions/profile.ts) calls
 * stripe.billingPortal.sessions.create() with no `configuration` param,
 * so every member is routed through the account's one default
 * configuration — there's nothing per-customer to check separately.
 *
 * Usage:
 *   yarn verify-portal-subscription-update              # live — .env.production
 *   yarn verify-portal-subscription-update --dry-run     # .env.local instead
 *
 * Exit code 0 when subscription_update is off (or the whole portal
 * config is inactive); exit code 1 when it's still on, so this can be
 * used as a CI/pre-flight gate as well as a one-off check.
 */

import { config } from "dotenv";
import { resolve } from "path";

const dryRun = process.argv.includes("--dry-run");
const envFile = dryRun ? ".env.local" : ".env.production";
config({ path: resolve(process.cwd(), envFile) });

if (dryRun) {
  console.log(`DRY RUN — reading ${envFile}'s Stripe account, not production.`);
}

const { getStripe } = await import("../lib/stripe.ts");

async function main() {
  const stripe = getStripe();

  const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  const cfg = configs.data[0];

  if (!cfg) {
    console.error("✗ No default billing portal configuration found on this account.");
    process.exit(1);
  }

  const su = cfg.features.subscription_update;
  const sc = cfg.features.subscription_cancel;
  const pm = cfg.features.payment_method_update;
  const ih = cfg.features.invoice_history;
  // subscription_pause is present on the account's live API response but
  // missing from the installed stripe SDK's type declarations (newer than
  // its typings) — access it loosely rather than pinning the SDK version
  // just for a status line.
  const sp = (cfg.features as unknown as Record<string, { enabled: boolean }>).subscription_pause;

  console.log(`Configuration: ${cfg.id}${cfg.active ? "" : " (inactive)"}`);
  console.log(`  subscription_update:   ${su.enabled ? "ON" : "off"}${su.enabled ? `  (trial_update_behavior: ${su.trial_update_behavior})` : ""}`);
  console.log(`  subscription_cancel:   ${sc.enabled ? "ON" : "off"}${sc.enabled ? `  (mode: ${sc.mode})` : ""}`);
  console.log(`  payment_method_update: ${pm.enabled ? "ON" : "off"}`);
  console.log(`  invoice_history:       ${ih.enabled ? "ON" : "off"}`);
  console.log(`  subscription_pause:    ${sp?.enabled ? "ON" : "off"}`);

  // The config being fully inactive is also a safe state (the portal
  // session create call would fail closed), but flag it since that's
  // probably not what anyone intended either.
  if (!cfg.active) {
    console.log("\n⚠ This configuration is inactive — billingPortal.sessions.create() would error, not silently fall back.");
  }

  if (su.enabled) {
    console.log("\n✗ subscription_update is still ON. A trialing member touching the portal's plan-change flow will still end their trial and be charged immediately.");
    process.exit(1);
  }

  console.log("\n✓ subscription_update is off. Portal offers payment method, invoices, and cancel only, per Track C3.");
}

main().catch((e) => {
  console.error("✗ Failed:", e?.message ?? e);
  process.exit(1);
});
