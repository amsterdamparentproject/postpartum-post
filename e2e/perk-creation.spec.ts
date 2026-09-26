/**
 * Perk creation — E2E
 *
 * 1. A partner (with a website and one location) signs in and submits a
 *    perk from "Your Perks": headline, description, a code, Exclusive.
 * 2. The form prefilled the link with their website and preselected their
 *    only location; the preview card shows "In review", Exclusive, and the
 *    location's NEIGHBORHOOD — never the internal location label.
 * 3. Once published (set in the DB, standing in for admin approval), the
 *    perk shows on the public /perks page with no code anywhere in the page.
 * 4. A signed-in member sees it in their Perks tab (/my-perks), still with
 *    no code before redeeming.
 * 5. With no neighborhood on the location, cards fall back to the AREA.
 */

import { test, expect, type Browser } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedPartner,
  seedPartnerLocation,
  updatePartnerLocation,
  seedMember,
  getPartnerPerks,
  setPerkStatus,
  cleanupPartner,
  cleanupMember,
  cleanupAuthUser,
} from "./helpers/db";

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("a partner creates a perk; once published it shows on /perks and in a member's Perks tab", async ({ browser }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const website = `https://e2e-${run}.example.com`;
  const headline = `E2E perk ${run}`;
  const code = `E2E${run.toUpperCase()}`;
  // Unique display strings so assertions can't match another test's data.
  const neighborhood = `Buurt ${run}`;
  const area = `Gebied ${run}`;
  const internalLabel = `Internal label ${run}`;

  const partner = await seedPartner({ businessName: `E2E Studio ${run}`, url: website });
  const location = await seedPartnerLocation(partner.id, { label: internalLabel, neighborhood, area });
  const member = await seedMember({ firstName: "Mira" });

  const partnerSide = await newPage(browser);
  const memberSide = await newPage(browser);

  try {
    // ── 1. Partner submits the perk ─────────────────────────────────────────
    const p = partnerSide.page;
    await signInAs(p, partner.email);
    await p.goto("/partners/perks");

    // No perks yet, so the form opens straight away.
    await expect(p.getByRole("heading", { name: "Add new perk" })).toBeVisible();

    // Prefills: link = their website, location = their only location.
    await expect(p.getByLabel("Link")).toHaveValue(website);
    await expect(p.getByLabel("Location")).toHaveValue(location.id);

    await p.getByLabel("Headline").fill(headline);
    await p.getByLabel("Description").fill("Show this at the front desk.");
    await expect(p.getByRole("button", { name: "Code", pressed: true })).toBeVisible(); // default type
    await p.getByLabel("Code").fill(code);
    await p.getByText("Exclusive to Postpartum Post").click();
    await p.getByRole("button", { name: "Submit for review" }).click();

    // ── 2. Preview card ─────────────────────────────────────────────────────
    const partnerCard = p.getByRole("button", { name: `Edit perk: ${headline}` });
    await expect(partnerCard).toBeVisible();
    await expect(partnerCard.getByText("In review")).toBeVisible();
    await expect(partnerCard.getByText("Exclusive", { exact: true })).toBeVisible();
    await expect(partnerCard.getByText(neighborhood)).toBeVisible();
    await expect(p.getByText(internalLabel)).toHaveCount(0);

    const [perk] = await getPartnerPerks(partner.id);
    expect(perk).toMatchObject({
      title: headline,
      status: "pending",
      source: "partner_portal",
      redemption_type: "code",
      redemption_code: code,
      url: website,
      location_id: location.id,
      exclusive: true,
    });

    // ── 3. Published → public /perks, no code ───────────────────────────────
    await setPerkStatus(perk.id as string, "published");

    await p.goto("/perks");
    const publicCard = p.getByRole("heading", { name: headline }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(publicCard).toBeVisible();
    await expect(publicCard.getByText("Exclusive", { exact: true })).toBeVisible();
    await expect(publicCard.getByText(neighborhood)).toBeVisible();
    expect(await p.content()).not.toContain(code);

    // ── 4. Member's Perks tab, no code before redeeming ─────────────────────
    const m = memberSide.page;
    await signInAs(m, member.email);
    await m.goto("/my-perks");
    const memberCard = m.getByRole("button", { name: `Redeem now: ${headline}` });
    await expect(memberCard).toBeVisible();
    await expect(memberCard.getByText("Exclusive", { exact: true })).toBeVisible();
    await expect(memberCard.getByText(neighborhood)).toBeVisible();
    expect(await m.content()).not.toContain(code);

    // ── 5. No neighborhood → the area shows instead ─────────────────────────
    await updatePartnerLocation(location.id, { neighborhood: null });
    await m.reload();
    await expect(memberCard.getByText(area)).toBeVisible();
    await expect(memberCard.getByText(internalLabel)).toHaveCount(0);
  } finally {
    await partnerSide.context.close();
    await memberSide.context.close();
    await cleanupPartner(partner.id); // cascades to locations and perks
    await cleanupAuthUser(partner.email);
    await cleanupMember(member.id);
    await cleanupAuthUser(member.email);
  }
});
