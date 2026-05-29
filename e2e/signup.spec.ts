/**
 * Full sign-up flow — E2E
 *
 * 1. User fills in the sign-up form on the home page
 * 2. Redirected to Stripe hosted checkout
 * 3. Completes payment with the Stripe test card
 * 4. Lands on /success
 * 5. Follows the magic link from the welcome email
 *    (generated directly via Supabase admin — we don't fetch the actual inbox)
 * 6. Lands on /profile as an authenticated, active subscriber
 *
 * Prerequisites:
 *   - `yarn dev` running (or set reuseExistingServer: false in playwright.config.ts)
 *   - `stripe listen --forward-to localhost:3000/api/webhooks/stripe` running
 *     (the webhook activates the member and generates the magic link in the welcome email)
 *   - Stripe test mode price `commitment_3mo` must exist
 */

import { test, expect } from "@playwright/test";
import { generateMagicLink, signInAs } from "./helpers/auth";
import { cleanupMemberByEmail } from "./helpers/db";

const TEST_EMAIL = `e2e-signup-${Date.now()}@example.com`;

test.afterAll(async () => {
  await cleanupMemberByEmail(TEST_EMAIL);
});

test("full sign-up flow: form → Stripe checkout → success → profile", async ({ page }) => {
  // ── Step 1: Fill in the sign-up form ───────────────────────────────────
  await page.goto("/");

  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(TEST_EMAIL);

  // The FIRST20 plan is featured and selected by default in pilot mode
  // If pilot mode is off, click the 3-month commitment plan
  const first20Button = page.getByRole("button", { name: /founding members/i });
  if (await first20Button.isVisible()) {
    await first20Button.click();
  } else {
    await page.getByRole("button", { name: /3.month commitment/i }).click();
  }

  // ── Step 2: Submit and redirect to Stripe ──────────────────────────────
  await page.getByRole("button", { name: "Subscribe", exact: true }).click();

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
  expect(page.url()).toContain("checkout.stripe.com");

  // ── Step 3: Complete payment with Stripe test card ─────────────────────
  // Wait for the accordion button to be in the DOM — present once Stripe's form
  // renders, but CSS-hidden in the collapsed state (use 'attached', not 'visible').
  await expect(page.locator('[data-testid="card-accordion-item-button"]')).toBeAttached({ timeout: 15_000 });

  // Card is pre-selected on some sessions (accordion already open); on others
  // it's collapsed. When open, the accordion button intercepts pointer events on
  // the radio — clicking it would close the form. Only click to expand.
  const cardNumberInput = page.getByPlaceholder("1234 1234 1234 1234");
  if (!(await cardNumberInput.isVisible())) {
    // The accordion button is inside an overflow:hidden container so
    // scrollIntoViewIfNeeded() doesn't work — dispatch via evaluate() instead.
    await page.evaluate(() => {
      (document.querySelector('[data-testid="card-accordion-item-button"]') as HTMLElement)?.click();
    });
  }

  // Stripe's hosted checkout (checkout.stripe.com) renders card fields as
  // native inputs — no sub-iframes needed since the whole page is on Stripe's
  // own domain.
  await expect(cardNumberInput).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("1234 1234 1234 1234").fill("4242 4242 4242 4242");
  await page.getByPlaceholder("MM / YY").fill("12 / 26");
  await page.getByPlaceholder("CVC").fill("123");
  await page.getByPlaceholder("Full name on card").fill("Jane Doe");

  // Scroll the submit button into view — it sits below the fold after the
  // card form expands.
  const payButton = page.getByRole("button", { name: /pay and subscribe/i });
  await payButton.scrollIntoViewIfNeeded();
  await payButton.click();

  // ── Step 4: Land on /success ───────────────────────────────────────────
  await page.waitForURL("**/success**", { timeout: 30_000 });
  // The heading is personalized ("Welcome, Jane!") — verifies the name flowed
  // from the signup form through Stripe session metadata and into the DB.
  await expect(page.getByRole("heading", { name: /welcome, jane/i })).toBeVisible();

  // ── Step 5: Wait for the webhook to activate the member ────────────────
  // The webhook runs async — give it a moment to process.
  // (Requires `stripe listen` to be running locally.)
  await page.waitForTimeout(3_000);

  // ── Step 6: Navigate to magic link → land on /profile ──────────────────
  // We generate the link directly rather than fetching the welcome email inbox.
  await signInAs(page, TEST_EMAIL);

  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByLabel("First name")).toHaveValue("Jane");
});
