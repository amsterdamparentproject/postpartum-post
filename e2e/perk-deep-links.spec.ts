/**
 * Perk deep links and the Dutch Speaking Academy perk CTA — E2E
 *
 * 1. /perks?perk=<slug or id> opens the public carousel on that perk's page and
 *    rings its card. Checked on a phone-width screen (one card per page) for
 *    several perks, so at least one is off the first page whatever the ranking.
 * 2. The DSA splash page shows a Post Perks card for the live "Dutch Speaking
 *    Academy" perk, linking to /my-perks?perk=<slug>.
 * 3. Signed out, that link shows the sign-in form and the membership signup form.
 * 4. Signed in with perks access, it opens the perk's dialog.
 * 5. Cards in the /perks carousel link to /my-perks?perk=<slug> the same way.
 *
 * Prerequisites: migration 034 applied to the DB that .env.local points at
 * (perks.slug and the perks_partners view). Seeds its own partners and perks,
 * and removes them afterwards. The splash perk is seeded as featured so it wins
 * over any other perk by the same partner name already in the shared DB.
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedPartner,
  seedPerk,
  seedMember,
  seedMonthlyPerks,
  cleanupPartner,
  cleanupMember,
  cleanupAuthUser,
} from "./helpers/db";

test("/perks?perk= opens the carousel on the linked perk and rings its card", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const partner = await seedPartner({ businessName: `E2E Deep Link Cafe ${run}` });
  const perks = await Promise.all(
    [1, 2, 3, 4].map(async (n) => {
      const title = `E2E deep link perk ${n} ${run}`;
      const slug = `e2e-deep-${n}-${run}`;
      const { id } = await seedPerk(partner.id, { title, redemptionType: "code", code: `E2E${n}${run}`, slug });
      return { id, title, slug };
    }),
  );

  try {
    await page.setViewportSize({ width: 390, height: 844 }); // one card per page
    for (const perk of perks) {
      // By slug...
      await page.goto(`/perks?perk=${perk.slug}`);
      const ringed = page.locator('div[style*="box-shadow"]').filter({ hasText: perk.title });
      await expect(ringed).toBeInViewport();
    }
    // ...and by id, so older links keep working.
    await page.goto(`/perks?perk=${perks[3].id}`);
    await expect(page.locator('div[style*="box-shadow"]').filter({ hasText: perks[3].title })).toBeInViewport();
  } finally {
    await cleanupPartner(partner.id);
  }
});

test("DSA page perk card → /my-perks sign-in plus signup, or the perk dialog when signed in", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const title = `E2E DSA perk ${run}`;
  const slug = `e2e-dsa-${run}`;
  const partner = await seedPartner({ businessName: "Dutch Speaking Academy" });
  await seedPerk(partner.id, { title, redemptionType: "code", code: `E2E${run}`, slug, featured: true });
  const member = await seedMember({ firstName: "Robin" });
  await seedMonthlyPerks(member.id, new Date().toISOString().slice(0, 7));

  try {
    // ── 2. The card on the splash page ──────────────────────────────────────
    await page.goto("/dutch-speaking-academy");
    const cta = page.getByRole("link", { name: new RegExp(title) });
    await expect(cta).toHaveAttribute("href", `/my-perks?perk=${slug}`);
    await expect(cta.getByText("Activate your perk")).toBeVisible();

    // ── 3. Signed out: sign in, or join ─────────────────────────────────────
    await cta.click();
    await expect(page).toHaveURL(new RegExp(`/my-perks\\?perk=${slug}`));
    await expect(page.getByText("Already a member? Sign in to activate your perk")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Not a member yet? Join to unlock this perk!" })).toBeVisible();

    // ── 4. Signed in with perks access: the perk opens ──────────────────────
    await signInAs(page, member.email);
    await page.goto(`/my-perks?perk=${slug}`);
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  } finally {
    await cleanupPartner(partner.id);
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
  }
});

test("/perks carousel cards link to /my-perks?perk=<slug>", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const title = `E2E carousel link perk ${run}`;
  const slug = `e2e-carousel-${run}`;
  const partner = await seedPartner({ businessName: `E2E Carousel Cafe ${run}` });
  await seedPerk(partner.id, { title, redemptionType: "code", code: `E2E${run}`, slug, featured: true });

  try {
    await page.setViewportSize({ width: 390, height: 844 }); // one card per page
    await page.goto(`/perks?perk=${slug}`); // opens the carousel on this perk
    const card = page.getByRole("link", { name: new RegExp(title) });
    await expect(card).toHaveAttribute("href", `/my-perks?perk=${slug}`);

    // Signed out: sign-in plus the join pitch, with the perk kept in the URL.
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/my-perks\\?perk=${slug}`));
    await expect(page.getByText("Already a member? Sign in to activate your perk")).toBeVisible();
  } finally {
    await cleanupPartner(partner.id);
  }
});
