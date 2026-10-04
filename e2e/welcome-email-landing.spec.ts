/**
 * Welcome email landing pages — E2E
 *
 * The Stripe webhook puts ONE signed link in the welcome email, and where it
 * lands depends on the day (app/api/webhooks/stripe/route.ts):
 *
 *   - 1st-5th (opt-in window open): /matches, behind the "Opt into this round" button
 *   - after the 5th:                /my-perks, behind "Opt into Perks this month"
 *
 * We can't read the email in a test, so, as with every other spec, we mint the
 * same kind of signed link directly (generateMagicLink with the path the
 * webhook uses) and check the member lands on the right page, sees the right
 * prompt, and hasn't been opted in or charged just by arriving. The email's
 * wording and hrefs are covered by __tests__/lib/emails-welcome.test.ts; the
 * webhook's choice of link by __tests__/api/webhooks-stripe.test.ts.
 *
 * Only one of the two tests can run on a given day (the window is real
 * Amsterdam time), the other skips itself.
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedMember,
  cleanupMember,
  cleanupAuthUser,
  hasMemberPerks,
  hasMemberParticipation,
  getMemberMatchesRemainingByEmail,
} from "./helpers/db";
import { currentMonth, isOptinWindowOpenNow } from "./helpers/tokens";

test.describe("welcome email landing", () => {
  test("1st-5th: 'Opt into this round' lands on /matches with the opt-in choices", async ({ page }) => {
    test.skip(!isOptinWindowOpenNow(), "Opt-in window is closed today; see the after-the-5th test");

    const member = await seedMember({ firstName: "Early", lastName: "Joiner" });
    try {
      await signInAs(page, member.email, "/matches");

      await expect(page.getByText(/until the 5th to respond/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: /coffee/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /perks/i })).toBeVisible();

      // Arriving isn't a choice: nothing recorded, no round used.
      const month = currentMonth();
      expect(await hasMemberParticipation(member.id, month)).toBe(false);
      expect(await hasMemberPerks(member.id, month)).toBe(false);
      expect(await getMemberMatchesRemainingByEmail(member.email)).toBe(1);
    } finally {
      await cleanupMember(member.id);
      await cleanupAuthUser(member.email);
    }
  });

  test("after the 5th: 'Opt into Perks this month' lands on /my-perks, not opted in until they click", async ({ page }) => {
    test.skip(isOptinWindowOpenNow(), "Opt-in window is open today; see the 1st-5th test");

    const member = await seedMember({ firstName: "Late", lastName: "Joiner" });
    try {
      await signInAs(page, member.email, "/my-perks");

      await expect(page.getByText(/not too late to join this month.s round/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: /Get this month's Post Perks/i })).toBeVisible();
      // Matching has closed: no coffee/playdate choices.
      await expect(page.getByRole("button", { name: /coffee/i })).toHaveCount(0);

      const month = currentMonth();
      expect(await hasMemberPerks(member.id, month)).toBe(false);
      expect(await getMemberMatchesRemainingByEmail(member.email)).toBe(1);
    } finally {
      await cleanupMember(member.id);
      await cleanupAuthUser(member.email);
    }
  });
});
