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
  language: string[] | null;
  // Track E3: defaults to 1 (not the DB's own 0 default) so existing tests
  // that don't care about balance aren't silently gated out of coffee/
  // playdate opt-in — override to 0 to specifically test the gate.
  matches_remaining: number;
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
    language: null,
    matches_remaining: 1,
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

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.test");
  }
  const anon = createClient(url, anonKey);

  // Retries: diagnosed 2026-07-24 (same root cause hit in the site repo),
  // this project's admin.generateLink() intermittently mints a JWT with no
  // `kid` header for a brand-new auth user, which fails downstream
  // verification with "unrecognized JWT kid <nil> for algorithm ES256" — a
  // Supabase-side quirk, not caused by the @example.com domain issue (fixed
  // separately, see testEmail() above) since it recurs for real, deliverable
  // addresses too. See lib/supabase/generate-magic-link.ts for the full
  // diagnosis. Retrying tends to succeed on a later attempt.
  //
  // The whole generate+verify pair is retried together, not just
  // generateLink: a magic-link token_hash is one-time-use, so if verifyOtp
  // fails partway (same underlying quirk, seen under full-suite load where
  // many auth calls fire in quick succession) re-verifying the same
  // token_hash won't help — a fresh link is needed too.
  const maxAttempts = 3;
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const linkResult = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hashedToken = linkResult.data?.properties?.hashed_token;
    if (linkResult.error || !hashedToken) {
      lastError = linkResult.error?.message ?? "no hashed_token returned";
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }

    // Supabase issues a "signup"-type token (not "magiclink") when the email
    // has no existing auth.users row yet, since generateLink auto-creates the
    // user. verifyOtp's type must match whatever was actually issued, or it's
    // rejected as expired/invalid — so use verification_type from the
    // response rather than assuming "magiclink".
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: hashedToken,
      type: linkResult.data!.properties.verification_type as "magiclink" | "signup",
    });
    if (!verifyError && verified.session?.access_token) {
      return verified.session.access_token;
    }
    lastError = verifyError?.message ?? "no access_token returned";
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error(`getAccessTokenForEmail: failed after ${maxAttempts} attempts: ${lastError}`);
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

// ---------------------------------------------------------------------------
// Partner leads (db/migrations/024_perks.sql)
// ---------------------------------------------------------------------------

/**
 * Deterministic-but-unique URL for a test lead/idea submission — same
 * purpose as testEmail() above (collision-free across parallel test runs),
 * but for the business `url` findMatchingLead/guessBusinessNameFromUrl key
 * off of. Always a real, parseable https URL so guessBusinessNameFromUrl
 * (app/actions/partners.ts) doesn't fall back to its catch-all default.
 */
export function testLeadUrl(label: string): string {
  return `https://test-${label}-${crypto.randomUUID().slice(0, 8)}.example.com`;
}

export interface TestPartnerLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string;
  url: string;
  email: string | null;
  notes: { id: string; date: string; note: string }[];
  status: string;
  converted_partner_id: string | null;
}

/**
 * Inserts a partner_leads row directly (bypassing submitPartnerLead's
 * validation/dedup) — for setting up an "existing lead" a test then
 * submits against to exercise findMatchingLead/mergeIntoLead.
 */
export async function seedPartnerLead(
  overrides: Partial<Omit<TestPartnerLead, "id">> = {}
): Promise<TestPartnerLead> {
  const supabase = createTestSupabase();
  const id = crypto.randomUUID();
  const lead = {
    id,
    first_name: "Existing",
    last_name: "Contact",
    business_name: `Test Business ${id.slice(0, 8)}`,
    url: testLeadUrl(`seed-${id.slice(0, 8)}`),
    email: null,
    notes: [],
    status: "new",
    converted_partner_id: null,
    ...overrides,
  };
  const { error } = await supabase.from("partner_leads").insert(lead);
  if (error) throw new Error(`seedPartnerLead failed: ${error.message}`);
  return lead as TestPartnerLead;
}

export async function getPartnerLead(id: string): Promise<TestPartnerLead | null> {
  const supabase = createTestSupabase();
  const { data } = await supabase.from("partner_leads").select("*").eq("id", id).maybeSingle();
  return (data as TestPartnerLead) ?? null;
}

/**
 * submitPartnerLead/submitPerkIdea/addPartnerLeadIdea don't return the
 * row's id (just {success, error?}), so tests that exercise them directly
 * (rather than seeding a row themselves) look the resulting row up by its
 * known-unique url.
 */
export async function findPartnerLeadByUrl(url: string): Promise<TestPartnerLead | null> {
  const supabase = createTestSupabase();
  const { data } = await supabase.from("partner_leads").select("*").eq("url", url).maybeSingle();
  return (data as TestPartnerLead) ?? null;
}

export async function cleanupPartnerLead(id: string | undefined | null) {
  if (!id) return;
  const supabase = createTestSupabase();
  await supabase.from("partner_leads").delete().eq("id", id);
}

export async function cleanupPartnerLeadByUrl(url: string) {
  const supabase = createTestSupabase();
  await supabase.from("partner_leads").delete().eq("url", url);
}

// ---------------------------------------------------------------------------
// Partners, partner_locations, perks (db/migrations/024_perks.sql)
// ---------------------------------------------------------------------------

function testPartnerEmail(label: string): string {
  // Same deliverable-but-synthetic Gmail `+` addressing as testEmail()
  // above, for partners.email — getAccessTokenForEmail doesn't care
  // whether the address belongs to a member or a partner.
  return `amsterdamparentproject+partner-${label}@gmail.com`;
}

export interface TestPartner {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  url: string | null;
  description: string | null;
  image_url: string | null;
  email: string | null;
}

export async function seedPartner(overrides: Partial<Omit<TestPartner, "id">> = {}): Promise<TestPartner> {
  const supabase = createTestSupabase();
  const id = crypto.randomUUID();
  const partner: TestPartner = {
    id,
    first_name: "Test",
    last_name: "Partner",
    business_name: `Test Partner Biz ${id.slice(0, 8)}`,
    url: null,
    description: null,
    image_url: null,
    email: testPartnerEmail(id.slice(0, 8)),
    ...overrides,
  };
  const { error } = await supabase.from("partners").insert(partner);
  if (error) throw new Error(`seedPartner failed: ${error.message}`);
  return partner;
}

/** Deletes the partner row — partner_locations and perks cascade with it. */
export async function cleanupPartner(partnerId: string | undefined | null) {
  if (!partnerId) return;
  const supabase = createTestSupabase();
  await supabase.from("partners").delete().eq("id", partnerId);
}

export interface TestPartnerLocation {
  id: string;
  partner_id: string;
  label: string | null;
  address: string;
}

export async function seedPartnerLocation(
  partnerId: string,
  overrides: Partial<Omit<TestPartnerLocation, "id" | "partner_id">> = {}
): Promise<TestPartnerLocation> {
  const supabase = createTestSupabase();
  const id = crypto.randomUUID();
  const location = {
    id,
    partner_id: partnerId,
    label: null,
    address: "Some Test Street 1, Amsterdam",
    ...overrides,
  };
  const { error } = await supabase.from("partner_locations").insert(location);
  if (error) throw new Error(`seedPartnerLocation failed: ${error.message}`);
  return location;
}

/** Raw perk row, including fields (status, source, partner_id) the
 *  app-facing PartnerPerk/ReviewPerk types don't select. */
export async function getPerkRaw(id: string): Promise<Record<string, unknown> | null> {
  const supabase = createTestSupabase();
  const { data } = await supabase.from("perks").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function getPerkCategoryLinks(perkId: string): Promise<string[]> {
  const supabase = createTestSupabase();
  const { data } = await supabase.from("perks_category_links").select("category_id").eq("perk_id", perkId);
  return (data ?? []).map((r) => r.category_id as string);
}

/** perk_categories is seeded once by the migration (Fitness, Food & Drink,
 *  Services, Other) — tests reuse those real rows rather than inserting
 *  more. */
export async function getSeededPerkCategoryIds(limit = 2): Promise<string[]> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase.from("perk_categories").select("id").limit(limit);
  if (error) throw new Error(`getSeededPerkCategoryIds failed: ${error.message}`);
  return (data ?? []).map((r) => r.id as string);
}
