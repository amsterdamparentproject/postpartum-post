/**
 * Matching flow — E2E
 *
 * Three scenarios covering the full monthly match cycle from opt-in email
 * through to the match reveal page.
 *
 *   1. Opt-in (coffee)
 *      Simulate clicking "Coffee" in the opt-in email → auto sign-in →
 *      profile banner → pending match card → dry-run match round →
 *      match reveal page with correct member details.
 *
 *   2. Skip (opt-out)
 *      Simulate clicking "Skip" → auto sign-in on /billing →
 *      consecutive-skips counter visible → Stripe subscription extended
 *      by one month → member absent from dry-run match pool.
 *
 *   3. No response
 *      No action taken → member absent from dry-run match pool →
 *      billing date unchanged → consecutive-skips counter not shown.
 *
 * All match rounds use dryRun: true so no emails are sent and no
 * match_rounds / match_drafts rows are written to the DB.
 * Match pages are verified by seeding a match row directly
 * (bypassing the run-matcher → commit-matches pipeline).
 *
 * Prerequisites: OPTIN_TOKEN_SECRET, MATCHER_API_SECRET, STRIPE_SECRET_KEY,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  seedMember,
  seedMemberWithSubscription,
  seedParticipation,
  seedMatchDirect,
  cleanupMember,
  cancelStripeSubscription,
  getStripeTrialEnd,
  hasMemberParticipation,
  hasMemberSkip,
  getMemberMatchCount,
} from "./helpers/db";
import { currentMonth, buildOptinUrl, buildMatchPagePath } from "./helpers/tokens";

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

/**
 * Call POST /api/run-matcher with dryRun: true.
 * Returns the full JSON response so tests can inspect matched / unmatched arrays.
 */
async function dryRunMatcher(): Promise<{
  dryRun: boolean;
  matched: Array<{ member1: { id: string }; member2: { id: string } }>;
  unmatched: Array<{ id: string }>;
}> {
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) throw new Error("MATCHER_API_SECRET not set");

  const res = await fetch(`${BASE_URL}/api/run-matcher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ dryRun: true }),
  });

  if (!res.ok) {
    throw new Error(`run-matcher failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Wait for the browser to land on a URL matching `pattern` and for the
 * Supabase session to be stored in localStorage (indicating the magic-link
 * exchange completed and the member is signed in).
 */
async function waitForMagicLinkRedirect(page: Page, pattern: RegExp): Promise<void> {
  await page.waitForURL(pattern, { timeout: 20_000 });
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Test 1 — Opt-in (coffee)
// ---------------------------------------------------------------------------

test(
  "opt-in: coffee email → profile banner → pending match → dry-run match round → match page",
  async ({ page }) => {
    const month = currentMonth();
    const monthDate = `${month}-01`;

    // Seed two members. Member2 acts as the second match candidate so the
    // dry-run matcher has a pool of 2. No Stripe subscription needed here
    // since this test doesn't check billing.
    const member1 = await seedMember({ firstName: "Alice", lastName: "Optin" });
    const member2 = await seedMember({ firstName: "Bob", lastName: "Optin" });

    try {
      // ── Step 1: Simulate clicking "Coffee" in the monthly opt-in email ────
      // The URL encodes the member ID, month, action, and an HMAC token.
      // The /api/optin route validates the token, records monthly_participation,
      // and issues a Supabase magic link so the member is signed in on arrival.
      await page.goto(buildOptinUrl(member1.id, month, "coffee"));

      // ── Step 2: Lands on /profile?optin=coffee, signed in automatically ───
      await waitForMagicLinkRedirect(page, /\/profile.*optin=coffee/);

      // ── Step 3: Profile banner confirms the chosen topic ──────────────────
      await expect(page.getByText(/you're in/i)).toBeVisible();
      // The banner renders the topic inside a <span>, e.g. "your next coffee!"
      await expect(page.getByText(/coffee/)).toBeVisible();

      // ── Step 4: /matches shows a pending card for this month ──────────────
      await page.goto("/matches");

      await expect(page.getByText(/coffee match/i)).toBeVisible({ timeout: 10_000 });
      // Card subtitle shows the current month/year
      const monthLabel = new Date(monthDate).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      await expect(page.getByText(monthLabel)).toBeVisible();
      await expect(page.getByText(/pending/i)).toBeVisible();

      // ── Step 5: Add member2 to the pool so the dry-run has 2 candidates ───
      await seedParticipation(member2.id, month, "coffee");

      // ── Step 6: Dry-run match round — no emails sent, no DB writes ────────
      // This simulates what the n8n automation does on the 5th of the month,
      // verifying that both opted-in members would be paired.
      const result = await dryRunMatcher();

      expect(result.dryRun).toBe(true);

      // Both test members should appear in the matched pairs.
      // Other real participants from this month may also be present — we only
      // assert that our two members are included somewhere in the response.
      const pairedIds = result.matched.flatMap((p) => [p.member1.id, p.member2.id]);
      expect(pairedIds).toContain(member1.id);
      expect(pairedIds).toContain(member2.id);

      // ── Step 7: Match reveal page shows correct member details ────────────
      // In a live round, the match page URL is sent in the reveal email.
      // Here we seed the match directly to test the page without committing
      // a full round (which would conflict with any existing round for this month).
      const matchId = await seedMatchDirect(member1.id, member2.id, monthDate);

      await page.goto(buildMatchPagePath(matchId));

      await expect(page.getByText("Alice Optin")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Bob Optin")).toBeVisible();
      await expect(page.locator(`a[href="mailto:${member1.email}"]`)).toBeVisible();
      await expect(page.locator(`a[href="mailto:${member2.email}"]`)).toBeVisible();

    } finally {
      // cleanupMember deletes matches, participation, skips, subscriptions,
      // members, and the Supabase Auth user.
      await cleanupMember(member1.id);
      await cleanupMember(member2.id);
    }
  },
);

// ---------------------------------------------------------------------------
// Test 2 — Skip (opt-out)
// ---------------------------------------------------------------------------

test(
  "skip: skip email → /billing → subscription extended → not in match pool",
  async ({ page }) => {
    const month = currentMonth();

    // Real Stripe subscription needed so extendSubscriptionByOneMonth can
    // update the trial_end via the Stripe API.
    const member = await seedMemberWithSubscription({ firstName: "Carol", lastName: "Skip" });

    // Two extra members who opt in so the dry-run has a valid pool to run
    // against (the matcher needs ≥ 2 opted-in candidates to produce results).
    const pool1 = await seedMember({ firstName: "Pool", lastName: "One" });
    const pool2 = await seedMember({ firstName: "Pool", lastName: "Two" });

    try {
      // Record the subscription period before the skip so we can verify
      // the extension afterwards.
      const trialEndBefore = await getStripeTrialEnd(member.stripeSubscriptionId);

      // ── Step 1: Simulate clicking "Skip" in the monthly opt-in email ──────
      // The route records monthly_skips, increments consecutive_skips,
      // extends the Stripe subscription, and redirects to /billing?optin=skip.
      await page.goto(buildOptinUrl(member.id, month, "skip"));

      // ── Step 2: Lands on /billing, signed in automatically ────────────────
      await waitForMagicLinkRedirect(page, /\/billing/);

      // ── Step 3: Billing page reflects the skip ────────────────────────────
      // After the first skip, consecutive_skips = 1, which appears on the
      // billing page under "Months skipped in a row".
      await expect(page.getByText(/months skipped in a row/i)).toBeVisible({ timeout: 15_000 });

      // ── Step 4: Stripe subscription extended by approximately one month ───
      const trialEndAfter = await getStripeTrialEnd(member.stripeSubscriptionId);

      expect(trialEndAfter).not.toBeNull();
      expect(trialEndBefore).not.toBeNull();
      // Extension adds ~30 days; allow 28–33 days to account for month length
      const extensionDays = (trialEndAfter! - trialEndBefore!) / (24 * 60 * 60);
      expect(extensionDays).toBeGreaterThan(28);
      expect(extensionDays).toBeLessThan(33);

      // ── Step 5: DB reflects the skip, not an opt-in ───────────────────────
      expect(await hasMemberParticipation(member.id, month)).toBe(false);
      expect(await hasMemberSkip(member.id, month)).toBe(true);

      // ── Step 6: Seed pool members and run a dry-run match round ───────────
      await seedParticipation(pool1.id, month, "coffee");
      await seedParticipation(pool2.id, month, "coffee");

      const result = await dryRunMatcher();
      expect(result.dryRun).toBe(true);

      // ── Step 7: Skipping member is absent from the match pool ─────────────
      const pairedIds = result.matched.flatMap((p) => [p.member1.id, p.member2.id]);
      const unmatchedIds = result.unmatched.map((m) => m.id);
      expect(pairedIds).not.toContain(member.id);
      expect(unmatchedIds).not.toContain(member.id);

    } finally {
      await cancelStripeSubscription(member.stripeSubscriptionId);
      await cleanupMember(member.id);
      await cleanupMember(pool1.id);
      await cleanupMember(pool2.id);
    }
  },
);

// ---------------------------------------------------------------------------
// Test 3 — No response
// ---------------------------------------------------------------------------

test(
  "no response: no action → not in match pool → billing unchanged",
  async ({ page }) => {
    const month = currentMonth();

    // Real Stripe subscription so we can verify billing was not touched.
    const member = await seedMemberWithSubscription({ firstName: "Dana", lastName: "Noresponse" });

    const pool1 = await seedMember({ firstName: "Pool", lastName: "Three" });
    const pool2 = await seedMember({ firstName: "Pool", lastName: "Four" });

    try {
      // Record billing state before — no action will follow.
      const trialEndBefore = await getStripeTrialEnd(member.stripeSubscriptionId);

      // ── Step 1: Member takes no action (no opt-in, no skip) ──────────────
      // Nothing happens in the browser for this step.

      // ── Step 2: DB state: no participation, no skip ───────────────────────
      expect(await hasMemberParticipation(member.id, month)).toBe(false);
      expect(await hasMemberSkip(member.id, month)).toBe(false);

      // ── Step 3: Seed pool members and run a dry-run match round ───────────
      await seedParticipation(pool1.id, month, "coffee");
      await seedParticipation(pool2.id, month, "coffee");

      const result = await dryRunMatcher();
      expect(result.dryRun).toBe(true);

      // ── Step 4: Non-responding member is absent from the match pool ───────
      const pairedIds = result.matched.flatMap((p) => [p.member1.id, p.member2.id]);
      const unmatchedIds = result.unmatched.map((m) => m.id);
      expect(pairedIds).not.toContain(member.id);
      expect(unmatchedIds).not.toContain(member.id);

      // ── Step 5: Billing is unchanged ──────────────────────────────────────
      const trialEndAfter = await getStripeTrialEnd(member.stripeSubscriptionId);
      expect(trialEndAfter).toBe(trialEndBefore);

      // ── Step 6: Billing page shows no skip counter ────────────────────────
      await signInAs(page, member.email);
      await page.goto("/billing");

      // Subscription loads from Stripe — allow time for the API call
      await expect(page.getByText(/trial|active/i)).toBeVisible({ timeout: 15_000 });

      // consecutive_skips = 0 → "Months skipped in a row" section must not appear
      await expect(page.getByText(/months skipped in a row/i)).not.toBeVisible();

    } finally {
      await cancelStripeSubscription(member.stripeSubscriptionId);
      await cleanupMember(member.id);
      await cleanupMember(pool1.id);
      await cleanupMember(pool2.id);
    }
  },
);

// ---------------------------------------------------------------------------
// Test 4 — Double match
// ---------------------------------------------------------------------------

test(
  "double match: 2 active cards on /matches, both reveal pages correct, email note triggered",
  async ({ page }) => {
    const month = currentMonth();
    const monthDate = `${month}-01`;

    // Member A is double-matched (appears in two pairs).
    // Members B and C are each matched with A once.
    const memberA = await seedMember({ firstName: "Alex", lastName: "Double" });
    const memberB = await seedMember({ firstName: "Beth", lastName: "First" });
    const memberC = await seedMember({ firstName: "Chris", lastName: "Second" });

    try {
      // Seed two match rows for member A — simulates the odd-pool resolution
      // where a member with open_to_second_match=true is paired twice.
      const matchId1 = await seedMatchDirect(memberA.id, memberB.id, monthDate);
      const matchId2 = await seedMatchDirect(memberA.id, memberC.id, monthDate);

      // ── Step 1: Sign in as the double-matched member ──────────────────────
      await signInAs(page, memberA.email);
      await page.goto("/matches");

      // ── Step 2: Two active "Matched" cards visible ────────────────────────
      // Wait for the async fetch to complete
      await expect(page.getByText("Matched", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Matched", { exact: true })).toHaveCount(2);

      // Both partner names appear in the card headings
      await expect(page.getByText("Coffee with Beth")).toBeVisible();
      await expect(page.getByText("Coffee with Chris")).toBeVisible();

      // ── Step 3: First match reveal page shows correct pair ────────────────
      await page.goto(buildMatchPagePath(matchId1));
      await expect(page.getByText("Alex Double")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Beth First")).toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberA.email}"]`)).toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberB.email}"]`)).toBeVisible();

      // ── Step 4: Second match reveal page shows correct pair ───────────────
      await page.goto(buildMatchPagePath(matchId2));
      await expect(page.getByText("Alex Double")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Chris Second")).toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberA.email}"]`)).toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberC.email}"]`)).toBeVisible();

      // ── Step 5: Email double-match note trigger condition verified ─────────
      // send-match-emails builds matchCountById across all pairs for the month.
      // Member A appears in 2 pairs → isDoubleMatch=true → extra paragraph
      // "A quick note: we matched you twice…" is included in their emails.
      // Members B and C each appear in 1 pair → isDoubleMatch=false (no note).
      expect(await getMemberMatchCount(memberA.id, month)).toBe(2);
      expect(await getMemberMatchCount(memberB.id, month)).toBe(1);
      expect(await getMemberMatchCount(memberC.id, month)).toBe(1);

    } finally {
      await cleanupMember(memberA.id);
      await cleanupMember(memberB.id);
      await cleanupMember(memberC.id);
    }
  },
);

// ---------------------------------------------------------------------------
// Test 5 — Auth gate: signed-out and unrelated members are blocked
// ---------------------------------------------------------------------------

test(
  "auth gate: signed-out visitor and unrelated member both blocked from contact info",
  async ({ page }) => {
    const month = currentMonth();
    const monthDate = `${month}-01`;

    const memberA = await seedMember({ firstName: "Robin", lastName: "Private" });
    const memberB = await seedMember({ firstName: "Sam", lastName: "Private" });
    const outsider = await seedMember({ firstName: "Casey", lastName: "Outsider" });

    try {
      const matchId = await seedMatchDirect(memberA.id, memberB.id, monthDate);
      const matchPath = buildMatchPagePath(matchId);

      // ── Step 1: Signed-out visitor with a fully valid link+token ─────────
      await page.goto(matchPath);
      await expect(page.getByText(/sign in to see your match/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Robin Private")).not.toBeVisible();
      await expect(page.getByText("Sam Private")).not.toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberA.email}"]`)).not.toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberB.email}"]`)).not.toBeVisible();

      // ── Step 2: Signed in, but as someone who isn't part of this match ────
      await signInAs(page, outsider.email);
      await page.goto(matchPath);
      await expect(page.getByText(/this isn.t your match/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Robin Private")).not.toBeVisible();
      await expect(page.getByText("Sam Private")).not.toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberA.email}"]`)).not.toBeVisible();
      await expect(page.locator(`a[href="mailto:${memberB.email}"]`)).not.toBeVisible();

    } finally {
      await cleanupMember(memberA.id);
      await cleanupMember(memberB.id);
      await cleanupMember(outsider.id);
    }
  },
);
