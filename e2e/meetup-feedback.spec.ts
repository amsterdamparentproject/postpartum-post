/**
 * Meetup reminder email → "We met!" → match feedback — E2E
 *
 * Feedback is critical to capture, and the reminder email is the main way
 * members get to it: the one-click "We met!" link records the answer on the
 * member's own side of the match, signs them in, and lands them on feedback
 * for that match with the "great to hear" banner.
 */

import { test, expect } from "@playwright/test";
import { seedMember, seedMatchDirect, cleanupMember, getMeetupStatuses } from "./helpers/db";
import { currentMonth, buildMeetupStatusUrl } from "./helpers/tokens";

test("reminder email: We met! → signed in on match feedback with banner", async ({ page }) => {
  const partner = await seedMember({ firstName: "Beth", lastName: "Email" });
  const member = await seedMember({ firstName: "Alex", lastName: "Email" });
  const monthDate = `${currentMonth()}-01`;
  const monthName = new Date(`${monthDate}T00:00:00`).toLocaleString("en-US", { month: "long" });

  try {
    // The clicking member is member_id_2, so this also checks the side mapping
    const matchId = await seedMatchDirect(partner.id, member.id, monthDate);

    await page.goto(buildMeetupStatusUrl(member.id, matchId, "met"));
    await page.waitForURL(new RegExp(`/feedback\\?match=${matchId}&met=1`), { timeout: 20_000 });

    await expect(page.getByText(/Great to hear that you met up/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`${monthName} match with Beth`)).toBeVisible();
    expect(await getMeetupStatuses(matchId)).toEqual({ side1: "planning", side2: "met" });
  } finally {
    await cleanupMember(member.id);
    await cleanupMember(partner.id);
  }
});
