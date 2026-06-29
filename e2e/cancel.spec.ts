/**
 * Cancel subscription flow — E2E
 *
 * 1. Authenticated subscriber visits /billing
 * 2. Clicks "Cancel subscription"
 * 3. Confirms the cancellation
 * 4. App calls Stripe + updates the DB
 * 5. Lands on /unsubscribe/confirmed
 * 6. /billing now shows the subscription as canceled
 *
 * This test creates a real Stripe test subscription (on trial) so the
 * cancellation call hits Stripe end-to-end. No money is charged.
 *
 * Prerequisites:
 *   - STRIPE_SECRET_KEY in .env.local pointing to a test-mode Stripe account
 *   - `commitment_3mo` price created in Stripe
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { seedMemberWithSubscription, cleanupMember, cancelStripeSubscription, getMemberStatusByEmail } from "./helpers/db";

test("cancel subscription: billing page → confirm cancel → profile → subscription canceled", async ({ page }) => {
  // ── Setup: seed member with a real Stripe test subscription ─────────────
  const member = await seedMemberWithSubscription({ firstName: "Jane", lastName: "Doe" });

  try {
    // ── Step 1: Sign in as the member ─────────────────────────────────────
    await signInAs(page, member.email);
    await expect(page).toHaveURL(/\/profile/);

    // ── Step 2: Navigate to /billing ──────────────────────────────────────
    await page.goto("/billing");

    // Subscription details should be visible
    await expect(page.getByText(/3.month commitment|founding member/i)).toBeVisible({ timeout: 10_000 });

    // ── Step 3: Click "Cancel subscription" ───────────────────────────────
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    // Inline confirmation appears — actual text is "Cancel at the end of your billing period?"
    await expect(page.getByText(/cancel at the end of your billing period/i)).toBeVisible();

    // ── Step 4: Confirm the cancellation ──────────────────────────────────
    await page.getByRole("button", { name: "Yes, cancel" }).click();

    // ── Step 5: Redirected to /unsubscribe/confirmed ──────────────────────
    await page.waitForURL(/\/unsubscribe\/confirmed/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /you've been unsubscribed/i })).toBeVisible();

    // ── Step 6: Return to /billing — shows "Cancels on" with end date ────────
    await page.goto("/billing");

    // After cancellation the subscription stays active until the billing period
    // ends (cancel_at_period_end: true), so the billing page shows "Cancels on"
    // rather than removing the subscription details entirely.
    await expect(page.getByText(/cancels on/i)).toBeVisible({ timeout: 10_000 });
    // Cancel button should no longer be shown
    await expect(page.getByRole("button", { name: /cancel subscription/i })).not.toBeVisible();

    // ── Step 7: Member status in DB should be 'canceling', not 'inactive' ────
    const status = await getMemberStatusByEmail(member.email);
    expect(status).toBe("canceling");
  } finally {
    // Cleanup — cancel the Stripe sub if the test failed before doing so
    await cancelStripeSubscription(member.stripeSubscriptionId);
    await cleanupMember(member.id);
  }
});
