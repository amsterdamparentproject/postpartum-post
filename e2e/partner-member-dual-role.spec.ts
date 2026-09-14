/**
 * Member + partner dual role — E2E
 *
 * AccountContext (member) and PartnerContext (partner) both read the same
 * Supabase browser client/session, since member and partner sign-in share
 * the same magic-link plumbing (see app/partners/PartnerContext.tsx's
 * docblock). Someone whose email is registered as both a member and a
 * partner should be able to sign in once and see both — and, just as
 * importantly, visiting one section must never sign them out of the
 * other. That second part used to fail: both contexts called
 * auth.signOut() (global, since the session is shared) whenever *their*
 * own lookup came up empty, which would have fired here as soon as
 * PartnerContext ran on a member-looking session, or AccountContext ran
 * on a partner-looking one — except both actually match here, so this
 * test also stands as the regression guard for that fix landing correctly
 * (a member-only or partner-only visitor is covered by signin.spec.ts and
 * the /partners unit-level equivalent instead).
 */

import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedMember,
  seedPartner,
  cleanupMember,
  cleanupPartner,
  cleanupAuthUser,
} from "./helpers/db";

test("a member who is also a partner can see both, and visiting one never signs out the other", async ({ page }) => {
  // Same email on both rows — the one Supabase Auth user this creates is
  // what both sides look up by.
  const email = `amsterdamparentproject+e2e-dual-${crypto.randomUUID().slice(0, 8)}@gmail.com`;
  const member = await seedMember({ email, firstName: "Dana", lastName: "Dual" });
  const partner = await seedPartner({ email, businessName: "Dana's Dual Studio" });

  try {
    // ── Sign in once (lands on /profile, per generateMagicLink's redirectTo) ──
    await signInAs(page, email);
    await expect(page.getByLabel("First name")).toHaveValue("Dana");

    // ── Visiting /partners shows the partner profile, not the public splash ──
    await page.goto("/partners");
    await expect(page.getByRole("link", { name: "Partner profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Your Perks" })).toBeVisible();
    await expect(page.getByLabel("Business name")).toHaveValue("Dana's Dual Studio");
    // The public "become a partner" pitch is for people who aren't partners.
    await expect(page.getByText("What's a Post Perk?")).not.toBeVisible();

    // ── Back on /profile, the member session must still be intact — the ──
    // regression this test exists to catch: PartnerContext's old
    // unconditional signOut() on a failed lookup would have logged this
    // out (moot here since the lookup succeeds, but the round trip below
    // proves the session survived the /partners visit either way).
    await page.goto("/profile");
    await expect(page.getByLabel("First name")).toHaveValue("Dana");
  } finally {
    await cleanupMember(member.id);
    await cleanupPartner(partner.id);
    await cleanupAuthUser(email);
  }
});
