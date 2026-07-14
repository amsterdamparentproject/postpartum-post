/**
 * Test DB helpers — connect directly to the test Supabase project.
 *
 * Each test should call seedMember() + seedSubscription() in beforeEach,
 * and cleanupMember() in afterEach. Tests use unique UUIDs so parallel
 * runs don't collide.
 */

import { createClient } from "@supabase/supabase-js";
import type { Availability, Child } from "@/app/actions/profile";

export function createTestSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test"
    );
  }
  return createClient(url, key, { db: { schema: "postpartumpost" } });
}

export interface TestMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  consecutive_skips: number;
  stripe_customer_id: string;
  zipcode: string | null;
  availability: Availability | null;
  children: Child[] | null;
}

export async function seedMember(
  overrides: Partial<TestMember> = {}
): Promise<TestMember> {
  const supabase = createTestSupabase();
  const id = crypto.randomUUID();
  const member: TestMember = {
    id,
    email: `test-${id}@example.com`,
    first_name: "Test",
    last_name: "Member",
    status: "active",
    consecutive_skips: 0,
    stripe_customer_id: `cus_test_${id.slice(0, 8)}`,
    zipcode: null,
    availability: null,
    children: null,
    ...overrides,
  };
  const { error } = await supabase.from("members").insert(member);
  if (error) throw new Error(`seedMember failed: ${error.message}`);
  return member;
}

export interface TestSubscription {
  member_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
}

export async function seedSubscription(
  memberId: string,
  overrides: Partial<TestSubscription> = {}
): Promise<TestSubscription> {
  const supabase = createTestSupabase();
  const sub: TestSubscription = {
    member_id: memberId,
    stripe_subscription_id: `sub_test_${memberId.slice(0, 8)}`,
    stripe_price_id: "price_test_monthly",
    status: "active",
    ...overrides,
  };
  const { error } = await supabase.from("subscriptions").insert(sub);
  if (error) throw new Error(`seedSubscription failed: ${error.message}`);
  return sub;
}

export async function cleanupMember(memberId: string) {
  const supabase = createTestSupabase();
  // Delete in dependency order
  await supabase.from("matches").delete().or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`);
  await supabase.from("monthly_participation").delete().eq("member_id", memberId);
  await supabase.from("monthly_skips").delete().eq("member_id", memberId);
  await supabase.from("subscriptions").delete().eq("member_id", memberId);
  await supabase.from("members").delete().eq("id", memberId);
}

/**
 * Signs a member in server-side (no browser needed) and returns a real
 * Supabase access token for their session — for tests that need to exercise
 * code paths gated behind `supabase.auth.getUser(accessToken)`, e.g. the
 * match page's auth check.
 *
 * Mirrors what e2e/helpers/auth.ts does in a browser: generates a magic
 * link (which auto-creates the auth.users row if it doesn't exist yet),
 * then exchanges its token_hash for a session directly via verifyOtp
 * instead of navigating a page to process the redirect.
 */
export async function getAccessTokenForEmail(email: string): Promise<string> {
  const admin = createTestSupabase();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`getAccessTokenForEmail: generateLink failed: ${error?.message}`);
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.test");
  }
  const anon = createClient(url, anonKey);
  // Supabase issues a "signup"-type token (not "magiclink") when the email
  // has no existing auth.users row yet, since generateLink auto-creates the
  // user. verifyOtp's type must match whatever was actually issued, or it's
  // rejected as expired/invalid — so use verification_type from the response
  // rather than assuming "magiclink".
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: data.properties.verification_type as "magiclink" | "signup",
  });
  if (verifyError || !verified.session?.access_token) {
    throw new Error(`getAccessTokenForEmail: verifyOtp failed: ${verifyError?.message}`);
  }
  return verified.session.access_token;
}

/** Deletes the Supabase Auth user created by getAccessTokenForEmail, if any. */
export async function cleanupAuthUser(email: string): Promise<void> {
  const admin = createTestSupabase();
  const { data } = await admin.auth.admin.listUsers();
  const user = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
  }
}
