import { describe, it, expect, vi, afterEach } from "vitest";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase, getAccessTokenForEmail, cleanupAuthUser } from "@tests/helpers";
import { updateMemberProfile, getMemberProfile, checkMemberExists, getSubscriptionDetails } from "@/app/actions/profile";
import type { Availability, Child } from "@/app/actions/profile";
import { currentMonth, monthToDate } from "@/lib/tokens";

const { mockRetrieve } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: { update: vi.fn().mockResolvedValue({}) },
    subscriptions: { retrieve: mockRetrieve },
  }),
}));

vi.mock("@/lib/matcher", () => ({
  geocodeZipcode: vi.fn().mockResolvedValue({ lat: 52.374, lng: 4.89 }),
}));

describe("email case-insensitivity", () => {
  let memberId: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
  });

  it("getMemberProfile returns the member for a valid token, and null for an invalid one", async () => {
    const member = await seedMember();
    memberId = member.id;

    const token = await getAccessTokenForEmail(member.email);
    try {
      const result = await getMemberProfile(token);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(memberId);
      // A bogus token must never resolve to anyone's profile (audit Finding 1).
      expect(await getMemberProfile("not-a-real-token")).toBeNull();
    } finally {
      await cleanupAuthUser(member.email);
    }
  });

  it("checkMemberExists returns true regardless of input casing", async () => {
    const member = await seedMember();
    memberId = member.id;

    expect(await checkMemberExists(member.email.toUpperCase())).toBe(true);
    expect(await checkMemberExists(
      member.email.slice(0, 5).toUpperCase() + member.email.slice(5)
    )).toBe(true);
  });
});

describe("profile — geocoding on save", () => {
  let memberId: string;
  let memberEmail: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    if (memberEmail) await cleanupAuthUser(memberEmail);
  });

  it("writes lat/lng after a zipcode is saved", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;

    const token = await getAccessTokenForEmail(member.email);
    await updateMemberProfile(token, { zipcode: "1012AB" });

    const supabase = createTestSupabase();
    await vi.waitFor(async () => {
      const { data } = await supabase
        .from("members")
        .select("lat, lng")
        .eq("id", memberId)
        .single();
      expect(data?.lat).toBeCloseTo(52.374);
      expect(data?.lng).toBeCloseTo(4.89);
    }, { timeout: 3000 });
  });

  it("clears lat/lng when zipcode is set to null", async () => {
    const member = await seedMember({ zipcode: "1012AB" });
    memberId = member.id;
    memberEmail = member.email;

    // Seed existing coords directly
    const supabase = createTestSupabase();
    await supabase.from("members").update({ lat: 52.374, lng: 4.89 }).eq("id", memberId);

    const token = await getAccessTokenForEmail(member.email);
    await updateMemberProfile(token, { zipcode: null });

    await vi.waitFor(async () => {
      const { data } = await supabase
        .from("members")
        .select("lat, lng")
        .eq("id", memberId)
        .single();
      expect(data?.lat).toBeNull();
      expect(data?.lng).toBeNull();
    }, { timeout: 3000 });
  });
});

describe("profile — matching fields", () => {
  let memberId: string;
  let memberEmail: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    if (memberEmail) await cleanupAuthUser(memberEmail);
  });

  it("persists zipcode, children, and availability to the DB", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;

    const newZipcode = "1012AB";
    const newChildren: Child[] = [
      { birth_month: 3, birth_year: 2024, expected: false },
    ];
    const newAvailability: Availability = {
      days: ["monday", "wednesday"],
      times: ["morning"],
    };

    const token = await getAccessTokenForEmail(memberEmail);
    await updateMemberProfile(token, {
      zipcode: newZipcode,
      children: newChildren,
      availability: newAvailability,
    });

    const supabase = createTestSupabase();
    const { data } = await supabase
      .from("members")
      .select("zipcode, children, availability")
      .eq("id", memberId)
      .single();

    expect(data?.zipcode).toBe(newZipcode);
    expect(data?.children).toEqual(newChildren);
    expect(data?.availability).toEqual(newAvailability);
  });

  it("getMemberProfile returns the saved matching fields", async () => {
    const member = await seedMember({
      zipcode: "1054GH",
      children: [{ birth_month: 7, birth_year: 2023, expected: false }],
      availability: { days: ["friday"], times: ["afternoon", "evening"] },
    });
    memberId = member.id;
    memberEmail = member.email;

    const token = await getAccessTokenForEmail(memberEmail);
    try {
      const profile = await getMemberProfile(token);

      expect(profile?.zipcode).toBe("1054GH");
      expect(profile?.children).toEqual([
        { birth_month: 7, birth_year: 2023, expected: false },
      ]);
      expect(profile?.availability).toEqual({
        days: ["friday"],
        times: ["afternoon", "evening"],
      });
    } finally {
      await cleanupAuthUser(memberEmail);
    }
  });
});

describe("getSubscriptionDetails — is_skipping_this_month (Track C2)", () => {
  let memberId: string;
  let memberEmail: string;

  function stripeSubResponse() {
    return {
      status: "active",
      cancel_at_period_end: false,
      trial_end: null,
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      items: {
        data: [
          {
            price: {
              lookup_key: "standard_monthly",
              recurring: { interval: "month", interval_count: 1 },
            },
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          },
        ],
      },
    };
  }

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    if (memberEmail) await cleanupAuthUser(memberEmail);
    mockRetrieve.mockReset();
  });

  it("is true when a monthly_skips row exists for the current calendar month", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeSubResponse());

    const supabase = createTestSupabase();
    const { error } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: monthToDate(currentMonth()) });
    if (error) throw new Error(`seed monthly_skips failed: ${error.message}`);

    const token = await getAccessTokenForEmail(memberEmail);
    const details = await getSubscriptionDetails(token);

    expect(details?.is_skipping_this_month).toBe(true);
    // pause_collection should be gone entirely, not just falsy.
    expect(details).not.toHaveProperty("pause_collection");
  });

  it("is false when no monthly_skips row exists for the current month", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeSubResponse());

    const token = await getAccessTokenForEmail(memberEmail);
    const details = await getSubscriptionDetails(token);

    expect(details?.is_skipping_this_month).toBe(false);
  });

  it("is false for a skip recorded in a different month", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;
    await seedSubscription(memberId);
    mockRetrieve.mockResolvedValue(stripeSubResponse());

    // A month far in the past — never the current month.
    const supabase = createTestSupabase();
    const { error } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: "2199-01-01" });
    if (error) throw new Error(`seed monthly_skips failed: ${error.message}`);

    const token = await getAccessTokenForEmail(memberEmail);
    const details = await getSubscriptionDetails(token);

    expect(details?.is_skipping_this_month).toBe(false);
  });
});

describe("getSubscriptionDetails — current_period_end while trialing (bugfix)", () => {
  let memberId: string;
  let memberEmail: string;

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    if (memberEmail) await cleanupAuthUser(memberEmail);
    mockRetrieve.mockReset();
  });

  // Regression test: a previous version of getSubscriptionDetails computed
  // trial_end + one more full interval as "Next billing date" whenever
  // status was "trialing", on the mistaken assumption that trial_end here
  // means "first payment, real renewal is after that." This app never
  // creates a genuine pre-payment trial (see profile.ts's comment) — every
  // "trialing" subscription got there via extendSubscriptionToNext5th
  // pushing trial_end forward on an already-paying member, so trial_end IS
  // the next real charge. The bug overstated it by a full term — up to 6
  // months for a commitment_6mo member — which is exactly the shape the
  // sandbox record that surfaced this bug showed.
  it("shows trial_end itself, not trial_end plus another full interval, for a bundle plan", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;
    await seedSubscription(memberId);

    const trialEnd = Math.floor(Date.now() / 1000) + 60 * 86400; // 60 days out
    mockRetrieve.mockResolvedValue({
      status: "trialing",
      cancel_at_period_end: false,
      trial_end: trialEnd,
      items: {
        data: [
          {
            price: {
              lookup_key: "commitment_3mo",
              recurring: { interval: "month", interval_count: 3 },
            },
            current_period_end: trialEnd, // Stripe mirrors trial_end here while trialing
          },
        ],
      },
    });

    const token = await getAccessTokenForEmail(memberEmail);
    const details = await getSubscriptionDetails(token);

    expect(details?.current_period_end).toBe(trialEnd);
  });

  it("shows trial_end itself for a monthly plan too", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;
    await seedSubscription(memberId);

    const trialEnd = Math.floor(Date.now() / 1000) + 20 * 86400;
    mockRetrieve.mockResolvedValue({
      status: "trialing",
      cancel_at_period_end: false,
      trial_end: trialEnd,
      items: {
        data: [
          {
            price: {
              lookup_key: "standard_monthly",
              recurring: { interval: "month", interval_count: 1 },
            },
            current_period_end: trialEnd,
          },
        ],
      },
    });

    const token = await getAccessTokenForEmail(memberEmail);
    const details = await getSubscriptionDetails(token);

    expect(details?.current_period_end).toBe(trialEnd);
  });

  // Positive control: the two tests above only prove the bug (trial_end +
  // interval) is gone. This proves the ordinary, by-far-most-common case —
  // a normal active subscription, never trialing — still reports the right
  // date: item.current_period_end passed straight through, untouched.
  it("passes item.current_period_end straight through for a normal active subscription", async () => {
    const member = await seedMember();
    memberId = member.id;
    memberEmail = member.email;
    await seedSubscription(memberId);

    const periodEnd = Math.floor(Date.now() / 1000) + 25 * 86400;
    mockRetrieve.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      trial_end: null,
      items: {
        data: [
          {
            price: {
              lookup_key: "commitment_3mo",
              recurring: { interval: "month", interval_count: 3 },
            },
            current_period_end: periodEnd,
          },
        ],
      },
    });

    const token = await getAccessTokenForEmail(memberEmail);
    const details = await getSubscriptionDetails(token);

    expect(details?.current_period_end).toBe(periodEnd);
    expect(details?.status).toBe("active");
  });
});
