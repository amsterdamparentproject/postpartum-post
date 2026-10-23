/**
 * Admin "Comp a member" — E2E
 *
 * Covers /admin/members' Comp a member form (app/admin/members/):
 *   1. New email → green "not associated" message on blur; submitting creates
 *      an active comped_with_perks member with 1 round, and the gifted welcome
 *      email goes out with the admin's note replacing "Welcome!".
 *   2. New email, "match only", 3 rounds → comped_no_perks with 3 rounds, the
 *      message and email follow the count, and the email has no Post Perks
 *      paragraph.
 *   3. Existing member, 2 rounds → green "already associated" message, the
 *      name and Perks fields hide, submitting adds 2 rounds and emails them a
 *      short "rounds added" note (no welcome, no consent line).
 *   4. Existing member with the email box unticked → rounds added, no email.
 *
 * Emails: members use delivered+…@resend.dev (see testEmail() in
 * helpers/db.ts), so nothing reaches a real inbox, and the sent message is
 * read back from Resend (helpers/email.ts) to check the real rendered HTML.
 *
 * Prerequisites: ADMIN_USERNAME, ADMIN_PASSWORD in .env.local, E2E_RESEND_API_KEY (full access) in .env.test,
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
  getMemberConsentByEmail,
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

    await page.getByLabel("Reason").selectOption("giveaway");
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
    expect(sent.html).toContain("By clicking, you agree to our ");

    // Not consented until they click "Go to your profile"; clicking records it and signs them in.
    expect((await getMemberConsentByEmail(email))!.guidelines_accepted_at).toBeNull();
    const entry = hrefsIn(sent.html).find((h) => h.includes("/api/consent/enter"));
    expect(entry).toBeTruthy();
    const { pathname, search } = new URL(entry!);
    await page.goto(`${pathname}${search}`);
    await page.waitForURL(/\/profile/, { timeout: 30_000 });
    await expect(page.getByLabel("First name")).toBeVisible();
    const consent = await getMemberConsentByEmail(email);
    expect(consent!.guidelines_accepted_at).not.toBeNull();
    expect(consent!.eligibility_confirmed_at).not.toBeNull();
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
    // Three rounds: the message follows the count, and the email says so.
    await page.getByLabel("Reason").selectOption("friend_gift");
    await page.getByLabel("Rounds to give").fill("3");
    await expect(page.getByText("A new member will be created with 3 free rounds.")).toBeVisible();
    const sentAfter = new Date();
    await page.getByRole("button", { name: "Comp this member" }).click();
    await expect(page.getByText(/match only, no Post Perks/)).toBeVisible();

    expect(await getMemberBillingByEmail(email)).toMatchObject({
      billing_mode: "comped_no_perks",
      matches_remaining: 3,
    });

    const sent = await waitForEmail({ to: email, subjectIncludes: "gifted 3 free rounds", since: sentAfter });
    expect(sent.html).toContain("You've been gifted 3 free rounds");
    expect(sent.html).toContain("Welcome!");
    expect(hrefsIn(sent.html).some((h) => h.endsWith("/perks"))).toBe(false);
  } finally {
    await cleanupMemberByEmail(email);
    await cleanupAuthUser(email);
  }
});

test("an existing member gets rounds added, the name and Perks fields hide, and they are emailed", async ({ page }) => {
  const member = await seedCompedMember({ matchesRemaining: 0 });
  try {
    await enterEmail(page, member.email);
    await expect(page.getByText(GREEN_EXISTING)).toBeVisible();
    await expect(page.getByLabel("Match only, no Post Perks")).toBeHidden();
    // The note stays, since the email can carry one.
    await expect(page.getByPlaceholder(/Congrats, Holly/)).toBeVisible();

    await page.getByLabel("Reason").selectOption("customer_service");
    await page.getByLabel("Rounds to give").fill("2");
    await page.getByPlaceholder(/Congrats, Holly/).fill("Thanks for your patience!");
    await expect(page.getByText("2 free rounds will be added to their total.")).toBeVisible();
    const sentAfter = new Date();
    await page.getByRole("button", { name: "Comp this member" }).click();
    await expect(page.getByText(/already a member, so I added 2 free rounds/)).toBeVisible();
    await expect(page.getByText(/I emailed them to say so/)).toBeVisible();

    expect(await getMemberBillingByEmail(member.email)).toMatchObject({
      billing_mode: "comped_with_perks", // plan untouched
      matches_remaining: 2,
    });

    const sent = await waitForEmail({ to: member.email, subjectIncludes: "gifted 2 free rounds", since: sentAfter });
    expect(sent.html).toContain("Thanks for your patience!");
    expect(sent.html).toContain("You now have 2 rounds to use.");
    expect(sent.html).toContain("Go to billing");
    expect(sent.html).not.toContain("By clicking, you agree"); // no consent line for existing members
  } finally {
    await cleanupMember(member.id);
  }
});

test("unticking the email box adds the rounds and sends nothing", async ({ page }) => {
  const member = await seedCompedMember({ matchesRemaining: 0 });
  try {
    await enterEmail(page, member.email);
    await expect(page.getByText(GREEN_EXISTING)).toBeVisible();
    await page.getByLabel("Email them to say rounds were added").uncheck();
    await page.getByLabel("Reason").selectOption("friend_gift");
    await page.getByRole("button", { name: "Comp this member" }).click();
    await expect(page.getByText(/No email was sent\./)).toBeVisible();
    expect(await getMemberBillingByEmail(member.email)).toMatchObject({ matches_remaining: 1 });
  } finally {
    await cleanupMember(member.id);
  }
});
