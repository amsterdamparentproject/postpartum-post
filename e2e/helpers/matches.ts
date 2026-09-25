import type { Page } from "@playwright/test";
import { currentCardShowsMeetupPills } from "./tokens";

/**
 * Locator for the status shown on each active (current-month) match card:
 * the "Matched" badge before the 7th, the meetup pills from the 7th on.
 * One match per active card either way.
 */
export function activeMatchStatus(page: Page) {
  return currentCardShowsMeetupPills()
    ? page.getByRole("radiogroup")
    : page.getByText("Matched", { exact: true });
}
