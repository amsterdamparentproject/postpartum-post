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

/**
 * Builds a synthetic-but-real test email via Gmail's `+` addressing — all
 * mail still lands in the same real inbox (or nowhere, if unread), but the
 * domain is genuinely deliverable.
 *
 * Diagnosed 2026-07-24 (same root cause hit in the site repo): `@example.com`
 * (RFC 2606's reserved example domain, previously used here) gets a hard
 * SMTP 550 from Supabase's mail relay — "Invalid `to` field. Please use our
 * testing email address instead of domains like `example.com`." Every test
 * that reaches supabase.auth.admin.generateLink() (getAccessTokenForEmail
 * below, or any code path it exercises indirectly) hits this: despite
 * generateLink()'s whole point being to grab the returned link without
 * needing a real inbox, Supabase still attempts to send the email as a side
 * effect, and that send failing surfaces as a confusing, unrelated-looking
 * "unrecognized JWT kid" signature-verification error — a red herring, not
 * the real cause.
 */
function testEmail(label: string): string {
  return `amsterdamparentproject+${label}@gmail.com`;
}

export async function seedMember(
  overrides: Partial<TestMember> = {}
): Promise<TestMember> {
  const supabase = createTestSupabase();
  const id = crypto.randomUUID();
  const member: TestMember = {
    id,
    email: testEmail(`test-${id}`),
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

  // Retries: diagnosed 2026-07-24 (same root cause hit in the site repo),
  // this project's admin.generateLink() intermittently mints a JWT with no
  // `kid` header for a brand-new auth user, which fails downstream
  // verification with "unrecognized JWT kid <nil> for algorithm ES256" — a
  // Supabase-side quirk, not caused by the @example.com domain issue (fixed
  // separately, see testEmail() above) since it recurs for real, deliverable
  // addresses too. See lib/supabase/generate-magic-link.ts for the full
  // diagnosis. Retrying tends to succeed on a later attempt.
  const maxAttempts = 3;
  let data: Awaited<ReturnType<typeof admin.auth.admin.generateLink>>["data"] | undefined;
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (!result.error && result.data?.properties?.hashed_token) {
      data = result.data;
      break;
    }
    lastError = result.error?.message ?? "no hashed_token returned";
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (!data?.properties?.hashed_token) {
    throw new Error(`getAccessTokenForEmail: generateLink failed after ${maxAttempts} attempts: ${lastError}`);
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
