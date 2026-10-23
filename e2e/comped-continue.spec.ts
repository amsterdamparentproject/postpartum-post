/**
 * Comped members keeping going at the regular price — E2E
 *
 * A comped member whose free round is used, with no cohort offer to give them
 * a discount, is shown the regular prices on /billing and can start a real
 * Stripe Checkout. See lib/continue-offer.ts. Two ways to have no offer:
 *   1. No cohort at all (a gifted membership, e.g. from /admin/members).
 *   2. A cohort whose continue_promo_code_id is empty.
 * Also covers the /my-perks empty state for a match-only comped member.
 *
 * Prerequisites: Stripe test mode with the standard_monthly and
 * commitment_3mo prices, plus the usual Supabase keys in .env.local.
 * Checkout is only opened, never paid.
 */

import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedCompedMember,
  seedCohort,
  cleanupCohort,
  cleanupMember,
  cleanupAuthUser,
} from "./helpers/db";

async function expectRegularPriceOffer(page: Page) {
  await expect(page.getByText("Want to keep going? Pick how many rounds.")).toBeVisible();
  const plans = page.getByRole("button", { name: /round/i });
  await expect(plans).toHaveCount(2);
  // Regular price means nothing is struck through.
  await expect(page.locator(".line-through")).toHaveCount(0);
  await expect(page.getByText(/thank-you/)).toHaveCount(0);
}

test("a comped member with no cohort sees regular prices and can start checkout", async ({ page }) => {
  const member = await seedCompedMember({ matchesRemaining: 0 });
  try {
    await signInAs(page, member.email, "/billing");
    await expect(page.getByText("Free match used")).toBeVisible();
    await expectRegularPriceOffer(page);

    await page.getByRole("button", { name: /round/i }).first().click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  } finally {
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
  }
});

test("a cohort member whose cohort has no continue code falls back to regular prices", async ({ page }) => {
  const slug = `e2e-nocode-${Date.now().toString(36)}`;
  await seedCohort(slug);
  const member = await seedCompedMember({ matchesRemaining: 0, cohort: slug });
  try {
    await signInAs(page, member.email, "/billing");
    await expect(page.getByText(`Free match, E2E ${slug}`)).toBeVisible();
    await expectRegularPriceOffer(page);
  } finally {
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
    await cleanupCohort(slug);
  }
});

test("a match-only comped member sees the no-Perks state on /my-perks with a link to learn more", async ({ page }) => {
  const member = await seedCompedMember({ matchesRemaining: 1, includePerks: false });
  try {
    await signInAs(page, member.email, "/my-perks");
    await expect(page.getByText("Post Perks are for members who continue")).toBeVisible();
    await expect(page.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/perks");
  } finally {
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
  }
});
