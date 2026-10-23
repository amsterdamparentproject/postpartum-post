/**
 * Cohort signup — new member — E2E
 *
 * A parent from Dutch Speaking Academy opens the splash page, enters the
 * partner code and gets a comped (free, no-card) membership with one match.
 *
 * Prerequisites:
 *   - Migration 034 applied to the DB that .env.local points at
 *   - The `dsa` cohort has a signup code set, and E2E_DSA_CODE in .env.local
 *     holds that same code (the code is a secret, so it is not in the repo)
 *
 * No Stripe involved: the member never enters a card.
 */

import { test, expect } from "@playwright/test";
import { cleanupMemberByEmail, getMemberCohortByEmail, testEmail } from "./helpers/db";

const CODE = process.env.E2E_DSA_CODE;
const EMAIL = testEmail(`e2e-cohort-new-${Date.now()}`);

test.skip(!CODE, "E2E_DSA_CODE not set in .env.local");

test.afterAll(async () => {
  await cleanupMemberByEmail(EMAIL);
});

async function fillForm(page: import("@playwright/test").Page, code: string) {
  await page.goto("/dutch-speaking-academy");
  await page.getByLabel(/first name/i).fill("Cohort");
  await page.getByLabel(/last name/i).fill("Tester");
  await page.getByLabel(/^email/i).fill(EMAIL);
  await page.getByLabel(/dutch speaking academy code/i).fill(code);
  await page.getByLabel(/I am a parent/i).check();
  await page.getByLabel(/community guidelines/i).check();
}

test("wrong code is refused and creates no member", async ({ page }) => {
  await fillForm(page, "definitely-not-the-code");
  await page.getByRole("button", { name: /claim my free match/i }).click();

  await expect(page.getByText(/code/i).and(page.locator("p.text-red-600"))).toBeVisible({ timeout: 10_000 });
  expect(await getMemberCohortByEmail(EMAIL)).toBeNull();
});

test("new cohort member: splash page → code → comped member with one match", async ({ page }) => {
  await fillForm(page, CODE!);
  await page.getByRole("button", { name: /claim my free match/i }).click();

  await expect(page.getByText("You're in!")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/opt in november 1.5/i)).toBeVisible();

  const member = await getMemberCohortByEmail(EMAIL);
  expect(member).not.toBeNull();
  expect(member!.cohort).toBe("dsa");
  expect(member!.billing_mode).toBe("comped_no_perks");
  expect(member!.matches_remaining).toBe(1);
  expect(member!.cohort_joined_at).not.toBeNull();
});

test("signing up again with the same email doesn't grant a second free match", async ({ page }) => {
  // Relies on the previous test having created the (comped, cohort) member.
  await fillForm(page, CODE!);
  await page.getByRole("button", { name: /claim my free match/i }).click();

  await expect(
    page
      .getByText(/already a Postpartum Post member|already joined a partner program/i)
      .and(page.locator("p.text-red-600")),
  ).toBeVisible({ timeout: 10_000 });
  expect((await getMemberCohortByEmail(EMAIL))!.matches_remaining).toBe(1);
});
