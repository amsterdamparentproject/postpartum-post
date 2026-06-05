/**
 * DB + Stripe helpers for Playwright test setup/teardown.
 *
 * These run outside the browser — they talk directly to Supabase and Stripe
 * to seed data before a test and clean it up after.
 */

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { db: { schema: "postpartumpost" } });
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY in .env.local");
  return new Stripe(key);
}

// ---------------------------------------------------------------------------
// Member helpers
// ---------------------------------------------------------------------------

export interface SeededMember {
  id: string;
  email: string;
  stripeCustomerId: string;
}

/**
 * Insert an active member directly into the DB.
 * Used by sign-in and cancel tests that need a pre-existing subscriber.
 */
export async function seedMember(
  overrides: { email?: string; firstName?: string; lastName?: string } = {}
): Promise<SeededMember> {
  const db = supabase();
  const id = crypto.randomUUID();
  const email = overrides.email ?? `e2e-${id.slice(0, 8)}@example.com`;
  const stripeCustomerId = `cus_e2e_${id.slice(0, 8)}`;

  const { error } = await db.from("members").insert({
    id,
    email,
    first_name: overrides.firstName ?? "Test",
    last_name: overrides.lastName ?? "Member",
    status: "active",
    stripe_customer_id: stripeCustomerId,
    consecutive_skips: 0,
  });

  if (error) throw new Error(`seedMember failed: ${error.message}`);
  return { id, email, stripeCustomerId };
}

/**
 * Create a real Stripe test subscription for the given customer.
 * Uses the commitment_3mo price (looked up by lookup key).
 * Returns the Stripe subscription ID.
 */
export async function seedStripeSubscription(stripeCustomerId: string): Promise<string> {
  const s = stripe();

  const prices = await s.prices.list({ lookup_keys: ["commitment_3mo"] });
  const price = prices.data[0];
  if (!price) throw new Error("commitment_3mo price not found in Stripe — has it been created?");

  // Create customer in Stripe if it doesn't exist (we use a fake cus_ ID in seedMember)
  // For E2E we create a real Stripe customer instead
  const customer = await s.customers.create({ email: `${stripeCustomerId}@test.postpartumpost.com` });

  const sub = await s.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30-day trial
  });

  return sub.id;
}

/**
 * Seed a member with a matching Stripe subscription — ready for the cancel test.
 * Returns member details + the real Stripe subscription ID.
 */
export async function seedMemberWithSubscription(
  overrides: Parameters<typeof seedMember>[0] = {}
): Promise<SeededMember & { stripeSubscriptionId: string }> {
  const db = supabase();
  const s = stripe();

  // Create a real Stripe customer so cancellation works end-to-end
  const id = crypto.randomUUID();
  const email = overrides.email ?? `e2e-cancel-${id.slice(0, 8)}@example.com`;

  const customer = await s.customers.create({
    email,
    name: `${overrides.firstName ?? "Test"} ${overrides.lastName ?? "Member"}`,
  });

  // Create a real Stripe subscription on a trial so no money is charged
  const prices = await s.prices.list({ lookup_keys: ["commitment_3mo"] });
  const price = prices.data[0];
  if (!price) throw new Error("commitment_3mo price not found in Stripe");

  const sub = await s.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });

  // Insert member into DB pointing at the real Stripe customer
  const { error: memberError } = await db.from("members").insert({
    id,
    email,
    first_name: overrides.firstName ?? "Test",
    last_name: overrides.lastName ?? "Member",
    status: "active",
    stripe_customer_id: customer.id,
    consecutive_skips: 0,
  });
  if (memberError) throw new Error(`seedMemberWithSubscription member insert failed: ${memberError.message}`);

  // Insert subscription row in DB
  const { error: subError } = await db.from("subscriptions").insert({
    member_id: id,
    stripe_subscription_id: sub.id,
    stripe_price_id: price.id,
    status: "active",
  });
  if (subError) throw new Error(`seedMemberWithSubscription subscription insert failed: ${subError.message}`);

  return { id, email, stripeCustomerId: customer.id, stripeSubscriptionId: sub.id };
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

export async function cleanupMember(memberId: string): Promise<void> {
  const db = supabase();
  // Delete matches first (references members via foreign key)
  await db.from("matches").delete().or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`);
  await db.from("monthly_participation").delete().eq("member_id", memberId);
  await db.from("monthly_skips").delete().eq("member_id", memberId);
  await db.from("subscriptions").delete().eq("member_id", memberId);
  await db.from("members").delete().eq("id", memberId);
  // Delete the Supabase Auth user so test runs don't accumulate orphaned accounts
  try {
    await db.auth.admin.deleteUser(memberId);
  } catch {
    // Auth user may not exist (seedMember doesn't create one) — ignore
  }
}

/**
 * Delete a specific match row by ID.
 * Useful when cleaning up a match that was seeded directly via seedMatchDirect.
 * Not needed if cleanupMember is called for both matched members.
 */
export async function cleanupMatch(matchId: string): Promise<void> {
  await supabase().from("matches").delete().eq("id", matchId);
}

export async function cleanupMemberByEmail(email: string): Promise<void> {
  const db = supabase();
  const { data } = await db.from("members").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (data?.id) await cleanupMember(data.id);
}

/**
 * Purge all leftover e2e test members matching a given email pattern.
 * Run this once to clear accumulated stragglers from old or failed test runs.
 * Usage: import and call directly from a script or the Playwright global setup.
 */
export async function purgeTestMembers(emailPattern: string): Promise<number> {
  const db = supabase();
  const { data: members } = await db
    .from("members")
    .select("id")
    .like("email", emailPattern);
  if (!members?.length) return 0;
  await Promise.all(members.map(m => cleanupMember(m.id)));
  return members.length;
}

export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  try {
    await stripe().subscriptions.cancel(subscriptionId);
  } catch {
    // Already canceled — ignore
  }
}

// ---------------------------------------------------------------------------
// Matching-flow helpers
// ---------------------------------------------------------------------------

/**
 * Directly insert a monthly_participation row — simulates a member opting in
 * without going through the browser. Looks up the topic ID by name.
 */
export async function seedParticipation(
  memberId: string,
  month: string,        // "YYYY-MM"
  topicName: "coffee" | "playdate",
): Promise<void> {
  const db = supabase();
  const { data: topic } = await db
    .from("topics")
    .select("id")
    .eq("name", topicName)
    .maybeSingle();
  if (!topic) throw new Error(`Topic "${topicName}" not found in topics table`);

  const { error } = await db.from("monthly_participation").insert({
    member_id: memberId,
    month: `${month}-01`,
    topic_id: topic.id,
  });
  if (error) throw new Error(`seedParticipation failed: ${error.message}`);
}

/**
 * Insert a match row directly, bypassing run-matcher + commit-matches.
 * Used to test the match reveal page without running a full commit round.
 * Returns the generated match ID.
 */
export async function seedMatchDirect(
  member1Id: string,
  member2Id: string,
  topic: "coffee" | "playdate",
  matchedOn: string,    // "YYYY-MM-01"
): Promise<string> {
  const db = supabase();
  const matchId = crypto.randomUUID();
  const { error } = await db.from("matches").insert({
    id: matchId,
    member_id_1: member1Id,
    member_id_2: member2Id,
    match_type: topic,
    matched_on: matchedOn,
  });
  if (error) throw new Error(`seedMatchDirect failed: ${error.message}`);
  return matchId;
}

/**
 * Fetch the trial_end timestamp (Unix seconds) from a Stripe subscription.
 * Returns null if the subscription is not in a trial period.
 */
export async function getStripeTrialEnd(subscriptionId: string): Promise<number | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items"] });
  return sub.trial_end;
}

/** Returns true if a monthly_participation row exists for the member this month. */
export async function hasMemberParticipation(memberId: string, month: string): Promise<boolean> {
  const { data } = await supabase()
    .from("monthly_participation")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", `${month}-01`)
    .maybeSingle();
  return !!data;
}

/** Returns true if a monthly_skips row exists for the member this month. */
export async function hasMemberSkip(memberId: string, month: string): Promise<boolean> {
  const { data } = await supabase()
    .from("monthly_skips")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", `${month}-01`)
    .maybeSingle();
  return !!data;
}
