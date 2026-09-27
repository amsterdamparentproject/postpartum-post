/**
 * Perk redemption — E2E (the members' Perks tab, /my-perks)
 *
 * Code perk:
 * 1. Opening it shows the dashed box with a hidden code and logs 'viewed'.
 * 2. "Reveal code" logs 'redeemed' and shows the real code plus a link to
 *    the partner.
 * 3. Re-opening it the same month goes straight to the code — marked
 *    "Redeemed this month", no second 'redeemed' and no extra 'viewed'.
 * In-person perk:
 * 4. "Use this perk" shows the member screen with their first name.
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedPartner,
  seedPerk,
  seedMember,
  countPerkEvents,
  cleanupPartner,
  cleanupMember,
  cleanupAuthUser,
} from "./helpers/db";

test("a member redeems a code perk once a month, and an in-person perk shows the member screen", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const website = `https://e2e-${run}.example.com`;
  const codeTitle = `E2E code perk ${run}`;
  const inPersonTitle = `E2E in-person perk ${run}`;
  const code = `E2E${run.toUpperCase()}`;

  const partner = await seedPartner({ businessName: `E2E Cafe ${run}`, url: website });
  const codePerk = await seedPerk(partner.id, { title: codeTitle, redemptionType: "code", code });
  const inPersonPerk = await seedPerk(partner.id, {
    title: inPersonTitle,
    redemptionType: "in_person",
    description: "Show this screen at the counter.",
  });
  const member = await seedMember({ firstName: "Robin" });

  try {
    await signInAs(page, member.email);
    await page.goto("/my-perks");

    // ── 1. Open: hidden code, 'viewed' logged ───────────────────────────────
    await page.getByRole("button", { name: `Redeem now: ${codeTitle}` }).click();
    const dialog = page.getByRole("dialog", { name: codeTitle });
    await expect(dialog.getByText("Your code")).toBeVisible();
    await expect(dialog.getByText("••••••")).toBeVisible();
    expect(await page.content()).not.toContain(code);
    await expect.poll(() => countPerkEvents(codePerk.id, member.id, "viewed")).toBe(1);

    // ── 2. Reveal: real code, 'redeemed' logged ─────────────────────────────
    await dialog.getByRole("button", { name: "Reveal code" }).click();
    await expect(dialog.getByText(code, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy code" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: `Visit ${partner.businessName}` })).toHaveAttribute("href", website);
    expect(await countPerkEvents(codePerk.id, member.id, "redeemed")).toBe(1);

    // ── 3. Re-open the same month: straight to the code ─────────────────────
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.reload();
    const usedCard = page.getByRole("button", { name: `View perk: ${codeTitle}` });
    await expect(usedCard.getByText("Redeemed this month")).toBeVisible();
    await usedCard.click();
    await expect(page.getByRole("dialog", { name: codeTitle }).getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reveal code" })).toHaveCount(0);
    expect(await countPerkEvents(codePerk.id, member.id, "redeemed")).toBe(1);
    expect(await countPerkEvents(codePerk.id, member.id, "viewed")).toBe(1);
    await page.getByRole("dialog", { name: codeTitle }).getByRole("button", { name: "Close" }).click();

    // ── 4. In-person perk: member screen ────────────────────────────────────
    await page.getByRole("button", { name: `Redeem now: ${inPersonTitle}` }).click();
    const inPersonDialog = page.getByRole("dialog", { name: inPersonTitle });
    await inPersonDialog.getByRole("button", { name: "Use this perk" }).click();
    await expect(inPersonDialog.getByText("Robin · Postpartum Post member")).toBeVisible();
    await expect(inPersonDialog.getByText(/^Redeemed for /)).toBeVisible();
    await expect(inPersonDialog.getByText(`Show this screen at ${partner.businessName}.`)).toBeVisible();
    expect(await countPerkEvents(inPersonPerk.id, member.id, "redeemed")).toBe(1);
  } finally {
    await cleanupPartner(partner.id); // cascades to perks and their events
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
  }
});
