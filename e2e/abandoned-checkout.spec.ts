/**
 * Abandoned checkout — E2E
 *
 * Verifies that a user who navigates away from Stripe checkout can re-subscribe
 * with the same email without hitting an "already signed up" error.
 *
 * Flow:
 *   1. Fill in the signup form → redirected to Stripe checkout
 *   2. Simulate navigating back (visit the cancel_url with the session ID)
 *   3. Member is marked `abandoned` in the DB
 *   4. Re-submit the form with the same email → redirected to a new Stripe
 *      checkout session (not shown an error)
 *
 * Prerequisites:
 *   - `yarn dev` running (or reuseExistingServer: false in playwright.config.ts)
 *   - Migration 012_abandoned_member_status.sql applied to the test DB
 *   - Stripe test mode price `commitment_3mo` must exist
 */

import { test, expect } from "@playwright/test";
import { cleanupMemberByEmail, getMemberStatusByEmail } from "./helpers/db";

const TEST_EMAIL = `e2e-abandoned-${Date.now()}@example.com`;

test.afterAll(async () => {
  await cleanupMemberByEmail(TEST_EMAIL);
});

test("abandoned checkout: member can re-subscribe after navigating away from Stripe", async ({ page }) => {
  // ── Step 1: Fill in the signup form ───────────────────────────────────────
  await page.goto("/");

  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(TEST_EMAIL);

  const first20Button = page.getByRole("button", { name: /founding members/i });
  if (await first20Button.isVisible()) {
    await first20Button.click();
  } else {
    await page.getByRole("button", { name: /3.month commitment/i }).click();
  }

  // ── Step 2: Check consent boxes, submit, and capture the session ID ──────
  await page.getByLabel(/I am a parent/).check();
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Subscribe", exact: true }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });

  // The Stripe checkout URL embeds the session ID: .../c/pay/cs_test_xxxx
  const sessionId = page.url().match(/cs_(?:test|live)_[A-Za-z0-9]+/)?.[0];
  expect(sessionId).toBeTruthy();

  // Member should be pending at this point
  expect(await getMemberStatusByEmail(TEST_EMAIL)).toBe("pending");

  // ── Step 3: Simulate Stripe's cancel_url redirect (user navigates back) ───
  // Stripe replaces {CHECKOUT_SESSION_ID} in cancel_url with the real session ID.
  // The /canceled route handler marks the member abandoned, then redirects to /.
  await page.goto(`/canceled?session_id=${sessionId}`);
  await page.waitForURL(/\/$/, { timeout: 15_000 });

  // ── Step 4: Member should now be abandoned ────────────────────────────────
  expect(await getMemberStatusByEmail(TEST_EMAIL)).toBe("abandoned");

  // ── Step 5: Re-submit the form with the same email ────────────────────────
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(TEST_EMAIL);

  const first20ButtonAgain = page.getByRole("button", { name: /founding members/i });
  if (await first20ButtonAgain.isVisible()) {
    await first20ButtonAgain.click();
  } else {
    await page.getByRole("button", { name: /3.month commitment/i }).click();
  }

  await page.getByLabel(/I am a parent/).check();
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Subscribe", exact: true }).click();

  // Should redirect to a new Stripe checkout session — not show "already signed up"
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
  expect(page.url()).toContain("checkout.stripe.com");

  // Member is back to pending, ready for checkout
  expect(await getMemberStatusByEmail(TEST_EMAIL)).toBe("pending");
});
