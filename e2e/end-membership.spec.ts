/**
 * Canceled-member flows — E2E
 *
 * Cancel only stops billing; the member keeps the rounds they paid for. A
 * banner above the account tabs tells them so and offers two ways out:
 *
 *   - Resume: they changed their mind (needs a live subscription).
 *   - End everything now: forfeit the remaining rounds and stop the monthly
 *     opt-in emails. The opt-in email links here with ?end=1, which opens the
 *     confirmation dialog straight away.
 *
 * Prerequisites: same as cancel.spec.ts (test-mode Stripe, `stripe listen`
 * running so the seeded subscription credits its rounds).
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedMemberWithSubscription,
  seedCancelingMember,
  cleanupMember,
  cancelStripeSubscription,
  getMemberStatusByEmail,
  getMemberCanceledAtByEmail,
  getMemberMatchesRemainingByEmail,
} from "./helpers/db";

test("cancel, then resume: banner shows on every tab and Resume restores the membership", async ({ page }) => {
  const member = await seedMemberWithSubscription({ firstName: "Jane", lastName: "Doe" });

  try {
    await signInAs(page, member.email);
    await page.goto("/billing");

    // ── Cancel in the app ─────────────────────────────────────────────────
    await page.getByRole("button", { name: /cancel membership/i }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await page.waitForURL(/\/unsubscribe\/confirmed/, { timeout: 15_000 });

    expect(await getMemberStatusByEmail(member.email)).toBe("canceling");
    expect(await getMemberCanceledAtByEmail(member.email)).not.toBeNull();

    // ── The banner sits above the tabs, so it shows on each of them ───────
    const banner = page.getByText("Your membership is canceled.");
    await page.goto("/profile");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await page.goto("/billing");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // ── Resume ────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Resume membership" }).click();
    // The action reloads the page so the new status reaches every tab.
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /cancel membership/i })).toBeVisible();

    expect(await getMemberStatusByEmail(member.email)).toBe("active");
    expect(await getMemberCanceledAtByEmail(member.email)).toBeNull();
  } finally {
    await cancelStripeSubscription(member.stripeSubscriptionId);
    await cleanupMember(member.id);
  }
});

test("canceled member ends everything now via the email link: rounds forfeited, membership ended", async ({ page }) => {
  const member = await seedCancelingMember({ matchesRemaining: 2 });

  try {
    await signInAs(page, member.email);

    // ── ?end=1 (the link in the opt-in and explainer emails) opens the dialog ─
    await page.goto("/billing?end=1");
    const dialog = page.getByRole("dialog", { name: /end everything now\?/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText("2 rounds");

    // Keeping the rounds closes it, drops ?end=1 and changes nothing.
    await dialog.getByRole("button", { name: "Keep my rounds" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/end=1/);
    expect(await getMemberMatchesRemainingByEmail(member.email)).toBe(2);
    expect(await getMemberStatusByEmail(member.email)).toBe("canceling");

    // ── Open it from the banner and confirm ───────────────────────────────
    await page.getByRole("button", { name: "End everything now" }).click();
    await page.getByRole("dialog", { name: /end everything now\?/i }).getByRole("button", { name: "Yes, end everything" }).click();

    await expect(page.getByText("Everything has ended.")).toBeVisible({ timeout: 15_000 });

    // No live subscription, so nothing else would finalize them: ended here.
    expect(await getMemberMatchesRemainingByEmail(member.email)).toBe(0);
    expect(await getMemberStatusByEmail(member.email)).toBe("inactive");

    // ── The billing page now describes an ended membership ────────────────
    await page.goto("/billing");
    await expect(page.getByText("Your membership has ended.")).toBeVisible({ timeout: 10_000 });
  } finally {
    await cleanupMember(member.id);
  }
});
