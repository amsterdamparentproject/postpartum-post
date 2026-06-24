/**
 * Rematch flow — E2E
 *
 * Scenario: a member with two active matches requests a rematch on one of them.
 *
 *   1. Sign in — /matches shows two "Matched" cards with correct partner names
 *   2. Navigate to match page for the second match — verify both member names
 *   3. Navigate back to /matches, request rematch on the second match via /rematch
 *   4. After submitting: lands on /rematch/confirmed
 *   5. /matches shows "Changed" pill on the second match card, quick actions gone
 *   6. First match card is unaffected — still "Matched" with quick actions
 *   7. Match reveal page for the rematched match is now inactive
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedMember,
  seedMatchDirect,
  cleanupMember,
} from "./helpers/db";
import { currentMonth, buildMatchPagePath } from "./helpers/tokens";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

test(
  "rematch: two active matches → rematch second → Changed pill, no actions, match page inactive",
  async ({ page }) => {
    const month = currentMonth();
    const monthDate = `${month}-01`;

    // Member A is the signed-in user. B and C are their two matches this month.
    const memberA = await seedMember({ firstName: "Alex", lastName: "Rematch" });
    const memberB = await seedMember({ firstName: "Beth", lastName: "Keeps" });
    const memberC = await seedMember({ firstName: "Chris", lastName: "Changed" });

    try {
      const matchId1 = await seedMatchDirect(memberA.id, memberB.id, monthDate);
      const matchId2 = await seedMatchDirect(memberA.id, memberC.id, monthDate);

      // ── Step 1: /matches shows two active cards ───────────────────────────
      await signInAs(page, memberA.email);
      await page.goto("/matches");

      await expect(page.getByText("Coffee with Beth").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Coffee with Chris").first()).toBeVisible();
      await expect(page.getByText("Matched", { exact: true })).toHaveCount(2);

      // ── Step 2: Navigate to second match page — verify member names ───────
      await page.goto(`${BASE_URL}${buildMatchPagePath(matchId2)}`);

      await expect(page.getByText("Alex Rematch")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Chris Changed")).toBeVisible();

      // ── Step 3: Request rematch on the second match via /rematch ──────────
      await page.goto(`/rematch?member_id=${memberA.id}&match_id=${matchId2}`);

      // Form loads — with two active matches, radio buttons should appear
      await expect(page.getByText("Chris Changed")).toBeVisible({ timeout: 10_000 });

      // Select "They didn't respond" from the reason dropdown
      await page.selectOption("select", "no_response");

      // Chris Changed should be pre-selected (passed via match_id); confirm & submit
      await page.getByRole("button", { name: /request a new match/i }).click();

      // ── Step 4: Lands on /rematch/confirmed ───────────────────────────────
      await page.waitForURL(/\/rematch\/confirmed/, { timeout: 15_000 });
      await expect(page.getByText(/we're on it/i)).toBeVisible();

      // ── Step 5: /matches — second card shows "Changed", no quick actions ──
      await page.goto("/matches");

      // "Changed" pill visible for the rematched card
      await expect(page.getByText("Changed", { exact: true })).toBeVisible({ timeout: 10_000 });

      // "Coffee with Chris" title is replaced by generic "Coffee match"
      await expect(page.getByText("Coffee with Chris")).not.toBeVisible();
      await expect(page.getByText("Coffee match")).toBeVisible();

      // ── Step 6: First card unaffected — still "Matched" with quick actions ─
      await expect(page.getByText("Coffee with Beth")).toBeVisible();
      await expect(page.getByText("Matched", { exact: true })).toBeVisible();

      // Go to match page button still present for the active match
      await expect(page.getByRole("link", { name: /go to match page/i }).first()).toBeVisible();

      // ── Step 7: Rematched match page is now inactive ──────────────────────
      await page.goto(`${BASE_URL}${buildMatchPagePath(matchId2)}`);

      // Contact info should be gone — only the "changed" message shown
      await expect(page.getByText(/match for this month has changed/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Chris Changed")).not.toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberC.email}"]`)).not.toBeVisible();

    } finally {
      await cleanupMember(memberA.id);
      await cleanupMember(memberB.id);
      await cleanupMember(memberC.id);
    }
  },
);
