/**
 * "No match, just perks" opt-in — E2E
 *
 * Covers the new opt-in choice added alongside coffee/playdate: a member
 * can get Post Perks access for the month without joining the matching
 * pool. See db/migrations/029_monthly_perks.sql and lib/monthly-opt-in.ts.
 *
 *   1. In-app prompt (/my-perks, not opted in this month) — picks "just
 *      perks" → the perk grid replaces the prompt, monthly_perks is
 *      recorded (not monthly_participation), and the credit isn't spent
 *      until a round actually commits.
 *   2. One-click email link (action=perks) — lands straight on /my-perks
 *      with perks already visible, no prompt.
 *   3. No balance — the button surfaces an error and records nothing.
 *
 * Prerequisites: OPTIN_TOKEN_SECRET, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY in .env.local (same as e2e/matching.spec.ts).
 */

import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedMember,
  seedPartner,
  seedPerk,
  cleanupMember,
  cleanupPartner,
  cleanupAuthUser,
  hasMemberPerks,
  hasMemberParticipation,
  getMemberMatchesRemainingByEmail,
} from "./helpers/db";
import { currentMonth, buildOptinUrl, isOptinWindowOpenNow } from "./helpers/tokens";

async function waitForMagicLinkRedirect(page: Page, pattern: RegExp): Promise<void> {
  await page.waitForURL(pattern, { timeout: 20_000 });
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
}

// The /my-perks prompt shows three buttons before the opt-in deadline (the
// 5th) and one afterward — pick whichever "just perks" button exists today
// so this spec passes regardless of what day it runs.
function justPerksButton(page: Page) {
  return isOptinWindowOpenNow()
    ? page.getByRole("button", { name: /Just Perks/i })
    : page.getByRole("button", { name: /Get this month's Post Perks/i });
}

test.describe("no match, just perks", () => {
  test("in-app prompt: choosing perks-only reveals the perk grid and records monthly_perks", async ({ page }) => {
    const run = crypto.randomUUID().slice(0, 8);
    const perkTitle = `E2E perks-only test perk ${run}`;
    const member = await seedMember({ firstName: "Priya", lastName: "Perks" });
    const partner = await seedPartner({ businessName: `E2E Perks Cafe ${run}` });
    await seedPerk(partner.id, { title: perkTitle, redemptionType: "in_person" });

    try {
      await signInAs(page, member.email);
      await page.goto("/my-perks");

      // Not opted in yet — the prompt, not the grid.
      await expect(page.getByText(/haven.t opted into Postpartum Post this month/i)).toBeVisible();

      await justPerksButton(page).click();

      // Prompt is replaced by the live grid, including our seeded perk.
      await expect(page.getByText(/haven.t opted into Postpartum Post this month/i)).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole("button", { name: `Redeem now: ${perkTitle}` })).toBeVisible();

      const month = currentMonth();
      expect(await hasMemberPerks(member.id, month)).toBe(true);
      expect(await hasMemberParticipation(member.id, month)).toBe(false);
      // Choosing "just perks" is gated on having a credit, but doesn't spend
      // one itself — that happens when a round actually commits.
      expect(await getMemberMatchesRemainingByEmail(member.email)).toBe(1);
    } finally {
      await cleanupPartner(partner.id); // cascades to perks
      await cleanupMember(member.id);
      await cleanupAuthUser(member.email);
    }
  });

  test("email link: action=perks lands on /my-perks with perks already visible", async ({ page }) => {
    const run = crypto.randomUUID().slice(0, 8);
    const perkTitle = `E2E perks-link test perk ${run}`;
    const member = await seedMember({ firstName: "Noor", lastName: "Perks" });
    const partner = await seedPartner({ businessName: `E2E Perks Studio ${run}` });
    await seedPerk(partner.id, { title: perkTitle, redemptionType: "online" });
    const month = currentMonth();

    try {
      await page.goto(buildOptinUrl(member.id, month, "perks"));
      await waitForMagicLinkRedirect(page, /\/my-perks.*optin=perks/);

      // Already opted in via the link — straight to the grid, no prompt.
      await expect(page.getByText(/haven.t opted into Postpartum Post this month/i)).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Redeem now: ${perkTitle}` })).toBeVisible();

      expect(await hasMemberPerks(member.id, month)).toBe(true);
    } finally {
      await cleanupPartner(partner.id);
      await cleanupMember(member.id);
      await cleanupAuthUser(member.email);
    }
  });

  test("no balance: perks-only button shows an error and records nothing", async ({ page }) => {
    const member = await seedMember({ firstName: "Zero", lastName: "Balance", matchesRemaining: 0 });

    try {
      await signInAs(page, member.email);
      await page.goto("/my-perks");

      await expect(page.getByText(/haven.t opted into Postpartum Post this month/i)).toBeVisible();
      await justPerksButton(page).click();

      await expect(page.getByText(/between terms/i)).toBeVisible({ timeout: 10_000 });
      // The prompt is still showing — nothing was recorded.
      await expect(page.getByText(/haven.t opted into Postpartum Post this month/i)).toBeVisible();

      const month = currentMonth();
      expect(await hasMemberPerks(member.id, month)).toBe(false);
    } finally {
      await cleanupMember(member.id);
      await cleanupAuthUser(member.email);
    }
  });
});
