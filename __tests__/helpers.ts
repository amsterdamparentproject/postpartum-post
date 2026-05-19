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
  await supabase.from("monthly_skips").delete().eq("member_id", memberId);
  await supabase.from("subscriptions").delete().eq("member_id", memberId);
  await supabase.from("members").delete().eq("id", memberId);
}
