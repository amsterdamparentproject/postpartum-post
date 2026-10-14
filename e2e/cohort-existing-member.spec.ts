/**
 * Cohort signup — existing paying member — E2E
 *
 * An existing member opens the Billing tab, enters a partner code and gets the
 * cohort's free round added to their balance.
 *
 * Prerequisites: same as cohort-signup.spec.ts (migration 034 applied, the
 * `dsa` cohort has a signup code, E2E_DSA_CODE in .env.local holds it).
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { seedMember, cleanupMember, cleanupAuthUser, getMemberCohortByEmail } from "./helpers/db";

const CODE = process.env.E2E_DSA_CODE;

test.skip(!CODE, "E2E_DSA_CODE not set in .env.local");

test("existing member redeems a partner code on the Billing tab", async ({ page }) => {
  const member = await seedMember({ firstName: "Existing", lastName: "Member", matchesRemaining: 1 });

  try {
    await signInAs(page, member.email, "/billing");
    await expect(page).toHaveURL(/\/billing/);

    const input = page.getByPlaceholder("Your code");
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Wrong code: refused, nothing changes
    await input.fill("definitely-not-the-code");
    await page.getByRole("button", { name: "Add code" }).click();
    await expect(page.getByText(/that code doesn.t look right/i)).toBeVisible({ timeout: 10_000 });
    const untouched = await getMemberCohortByEmail(member.email);
    expect(untouched!.cohort).toBeNull();
    expect(untouched!.matches_remaining).toBe(1);

    // Right code: welcome message, balance +1, tagged with the cohort
    await input.fill(CODE!);
    await page.getByRole("button", { name: "Add code" }).click();
    await expect(page.getByText(/a free round has been added to your membership/i)).toBeVisible({ timeout: 15_000 });

    const joined = await getMemberCohortByEmail(member.email);
    expect(joined!.cohort).toBe("dsa");
    expect(joined!.matches_remaining).toBe(2);
    expect(joined!.cohort_joined_at).not.toBeNull();
    expect(joined!.billing_mode).not.toMatch(/^comped/);

    // The page reloads itself and the Partner program card now shows the program, not the code input
    await expect(page.getByText("Your program")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Dutch Speaking Academy")).toBeVisible();
    await expect(page.getByPlaceholder("Your code")).toHaveCount(0);
  } finally {
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
  }
});

test("existing member uses the splash page: free round added to their account, once", async ({ page }) => {
  const member = await seedMember({ firstName: "Existing", lastName: "Splash", matchesRemaining: 1 });

  const submit = async (code: string) => {
    await page.goto("/dutch-speaking-academy");
    await page.getByLabel(/first name/i).fill("Existing");
    await page.getByLabel(/last name/i).fill("Splash");
    await page.getByLabel(/^email/i).fill(member.email);
    await page.getByLabel(/dutch speaking academy code/i).fill(code);
    await page.getByLabel(/I am a parent/i).check();
    await page.getByLabel(/community guidelines/i).check();
    await page.getByRole("button", { name: /claim my free match/i }).click();
  };

  try {
    // Wrong code: the form doesn't reveal that the email is a member
    await submit("definitely-not-the-code");
    await expect(page.getByText(/that code doesn.t look right/i)).toBeVisible({ timeout: 10_000 });
    expect((await getMemberCohortByEmail(member.email))!.cohort).toBeNull();

    // Right code: existing-member message, balance +1, tagged with the cohort
    await submit(CODE!);
    await expect(page.getByText(/you.re already a member with us/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1 free round will be added to your account/i)).toBeVisible();
    const joined = await getMemberCohortByEmail(member.email);
    expect(joined!.cohort).toBe("dsa");
    expect(joined!.matches_remaining).toBe(2);
    expect(joined!.billing_mode).not.toMatch(/^comped/);

    // Again: refused, no more free matches
    await submit(CODE!);
    await expect(page.getByText(/already joined a partner program/i)).toBeVisible({ timeout: 10_000 });
    expect((await getMemberCohortByEmail(member.email))!.matches_remaining).toBe(2);
  } finally {
    await cleanupMember(member.id);
  }
});
