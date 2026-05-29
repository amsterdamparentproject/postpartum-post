/**
 * Sign-in flow — E2E
 *
 * 1. Unauthenticated user navigates to /profile
 * 2. Sees the "sign in" prompt (MagicLinkRequest form)
 * 3. Enters their email and requests a magic link
 * 4. App shows "check your email" confirmation
 * 5. User follows the magic link
 *    (generated directly via Supabase admin — no inbox required)
 * 6. Lands on /profile as an authenticated subscriber
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { seedMember, cleanupMember } from "./helpers/db";

test("sign-in flow: request magic link → follow link → land on profile", async ({ page }) => {
  // ── Setup: seed an active member ────────────────────────────────────────
  const member = await seedMember({ firstName: "Jane", lastName: "Doe" });

  try {
    // ── Step 1: Visit /profile unauthenticated ───────────────────────────
    await page.goto("/profile");

    // Should see the magic link request form, not the profile
    await expect(page.getByText(/sign in to your profile/i)).toBeVisible();

    // ── Step 2: Enter email and request link ─────────────────────────────
    await page.getByPlaceholder(/email/i).fill(member.email);
    await page.getByRole("button", { name: /send me a sign-in link/i }).click();

    // ── Step 3: Confirm the "check your inbox" state ──────────────────────
    await expect(page.getByText(/check your inbox/i)).toBeVisible();

    // ── Step 4: Follow the magic link (bypass inbox) ─────────────────────
    await signInAs(page, member.email);

    // ── Step 5: Verify landing on /profile ───────────────────────────────
    await expect(page).toHaveURL(/\/profile/);
    // "Jane" is pre-filled into the First name input — check its value, not text content
    await expect(page.getByLabel("First name")).toHaveValue("Jane");
  } finally {
    await cleanupMember(member.id);
  }
});

test("unauthenticated visit to /profile shows sign-in form, not subscription form", async ({ page }) => {
  await page.goto("/profile");

  // Sign-in form is visible
  await expect(page.getByText(/sign in to your profile/i)).toBeVisible();

  // Profile content is not visible
  await expect(page.getByText(/save/i)).not.toBeVisible();
});
