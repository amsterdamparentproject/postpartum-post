/**
 * Admin "Comp a member" — E2E
 *
 * Covers /admin/members' Comp a member form (app/admin/members/):
 *   1. New email → green "not associated" message on blur; submitting creates
 *      an active comped_with_perks member with 1 round, and the gifted welcome
 *      email goes out with the admin's note replacing "Welcome!".
 *   2. New email, "match only" → comped_no_perks, and the email has no
 *      Post Perks paragraph.
 *   3. Existing member → green "already associated" message, name/note/perks
 *      fields hide, submitting adds one round and sends nothing.
 *
 * Emails: members use delivered+…@resend.dev (see testEmail() in
 * helpers/db.ts), so nothing reaches a real inbox, and the sent message is
 * read back from Resend (helpers/email.ts) to check the real rendered HTML.
 *
 * Prerequisites: ADMIN_USERNAME, ADMIN_PASSWORD, RESEND_API_KEY (full access),
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  testEmail,
  seedCompedMember,
  cleanupMember,
  cleanupMemberByEmail,
  cleanupAuthUser,
  getMemberBillingByEmail,
} from "./helpers/db";
import { waitForEmail, hrefsIn } from "./helpers/email";

test.skip(
  !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD,
  "ADMIN_USERNAME / ADMIN_PASSWORD not set in .env.local"
);

const GREEN_NEW = "This email is not associated with a member. A new member will be created with 1 free round.";
const GREEN_EXISTING = "This email is already associated with a member. A free round will be added to their total.";

async function adminLogin(page: Page) {
  // page.request shares the page's cookie jar, so the admin_session cookie
  // set by the login route is sent on the page's navigations too.
  const res = await page.request.post("/api/admin/login", {
    data: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
  });
  expect(res.ok()).toBe(true);
}

/** Types an email and blurs the field, which triggers the lookup. */
async function enterEmail(page: Page, email: string) {
  const field = page.locator('input[type="email"]');
  await field.fill(email);
  await field.blur();
}

test.beforeEach(async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/members");
  await expect(page.getByRole("button", { name: "Comp this member" })).toBeVisible();
});

test("comps a new member with Post Perks and sends the gifted welcome email with the note", async ({ page }) => {
  const email = testEmail(`e2e-comp-new-${Date.now()}`);
  try {
    await enterEmail(page, email);
    await expect(page.getByText(GREEN_NEW)).toBeVisible();

    await page.getByPlaceholder(/Congrats, Holly/).fill("Congrats, Test — you won our e2e giveaway!");
    const sentAfter = new Date();
    await page.getByRole("button", { name: "Comp this member" }).click();
    await expect(page.getByText(/welcome email is on its way/)).toBeVisible();

    const member = await getMemberBillingByEmail(email);
    expect(member).toMatchObject({ billing_mode: "comped_with_perks", matches_remaining: 1 });

    const sent = await waitForEmail({ to: email, subjectIncludes: "gifted a free round", since: sentAfter });
    expect(sent.html).toContain("Congrats, Test — you won our e2e giveaway!");
    expect(sent.html).not.toContain("Welcome!");
    expect(sent.html).toContain("Go to your profile");
    expect(hrefsIn(sent.html).some((h) => h.endsWith("/perks"))).toBe(true);
  } finally {
    await cleanupMemberByEmail(email);
    await cleanupAuthUser(email);
  }
});

test("comping match-only creates comped_no_perks and the email leaves out Post Perks", async ({ page }) => {
  const email = testEmail(`e2e-comp-nop-${Date.now()}`);
  try {
    await enterEmail(page, email);
    await expect(page.getByText(GREEN_NEW)).toBeVisible();

    await page.getByLabel("Match only, no Post Perks").check();
    const sentAfter = new Date();
    await page.getByRole("button", { name: "Comp this member" }).click();
    await expect(page.getByText(/match only, no Post Perks/)).toBeVisible();

    expect(await getMemberBillingByEmail(email)).toMatchObject({
      billing_mode: "comped_no_perks",
      matches_remaining: 1,
    });

    const sent = await waitForEmail({ to: email, subjectIncludes: "gifted a free round", since: sentAfter });
    expect(sent.html).toContain("Welcome!");
    expect(hrefsIn(sent.html).some((h) => h.endsWith("/perks"))).toBe(false);
  } finally {
    await cleanupMemberByEmail(email);
    await cleanupAuthUser(email);
  }
});

test("an existing member gets one more round, the extra fields hide, and no email is sent", async ({ page }) => {
  const member = await seedCompedMember({ matchesRemaining: 0 });
  try {
    await enterEmail(page, member.email);
    await expect(page.getByText(GREEN_EXISTING)).toBeVisible();
    await expect(page.getByPlaceholder(/Congrats, Holly/)).toBeHidden();
    await expect(page.getByLabel("Match only, no Post Perks")).toBeHidden();

    await page.getByRole("button", { name: "Comp this member" }).click();
    await expect(page.getByText(/already a member, so I added one round/)).toBeVisible();
    await expect(page.getByText(/no email was sent/)).toBeVisible();

    expect(await getMemberBillingByEmail(member.email)).toMatchObject({
      billing_mode: "comped_with_perks", // plan untouched
      matches_remaining: 1,
    });
  } finally {
    await cleanupMember(member.id);
  }
});
