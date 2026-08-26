"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { geocodeZipcode } from "@/lib/matcher";
import { requireMember } from "@/lib/require-member";
import { currentMonth, monthToDate } from "@/lib/tokens";

export type Availability = {
  days: string[];
  times: string[];
};

export type Child = {
  birth_month: number; // 1–12
  birth_year: number;
  expected: boolean;
};

export type MemberProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: "pending" | "active" | "paused" | "canceling" | "inactive" | "abandoned";
  zipcode: string | null;
  language: string[] | null;
  parent_type: "mom" | "dad" | "anyone";
  stripe_customer_id: string | null;
  consecutive_skips: number;
  availability: Availability | null;
  match_priority: "age" | "proximity" | null;
  children: Child[] | null;
  open_to_second_match: boolean;
  // Track C1: the counter Track B introduced, now actually read.
  matches_remaining: number;
};

export type Topic = {
  id: string;
  name: string;
};

export type SubscriptionDetails = {
  status: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  price_lookup_key: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  // Track C2: sourced from our own monthly_skips table, not Stripe's
  // pause_collection — this is our data, and it's the thing that actually
  // determines whether they're skipping, regardless of how Stripe's side
  // of the pause is implemented today or after Track E's cutover.
  is_skipping_this_month: boolean;
  // Track C1: distinguishes a bundle (matches-remaining counter is
  // meaningful) from a monthly plan (interval_count === 1, counter reads
  // 1-or-0 forever). null if the live Stripe fetch below failed.
  interval_count: number | null;
};

export async function checkMemberExists(email: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return data !== null;
}

export async function getMemberProfile(accessToken: string): Promise<MemberProfile | null> {
  // Identity comes from the verified session, never a client-supplied email
  // (audit Finding 1) — this used to accept any email and return its full PII.
  const authed = await requireMember(accessToken);
  if (!authed) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, status, zipcode, language, parent_type, stripe_customer_id, consecutive_skips, availability, match_priority, children, open_to_second_match, matches_remaining")
    .eq("id", authed.memberId)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = "no rows returned" — expected for non-members. Anything else is a real error.
    console.error("[getMemberProfile] query error:", error.code, error.message);
  }
  return data;
}

export async function getTopics(): Promise<Topic[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("topics")
    .select("id, name")
    .order("name");
  return data ?? [];
}

export async function getSubscriptionDetails(accessToken: string): Promise<SubscriptionDetails | null> {
  const authed = await requireMember(accessToken);
  if (!authed) return null;

  const supabase = createAdminClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, stripe_subscription_id, stripe_price_id")
    .eq("member_id", authed.memberId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) return null;

  let current_period_end: number | null = null;
  let cancel_at_period_end = false;
  let price_lookup_key: string | null = null;
  let interval_count: number | null = null;
  // Track C1: prefer the live Stripe status over the local DB mirror — it's
  // what actually determines the member-facing vocabulary below, and the
  // live fetch can be fresher than whatever the last webhook wrote. Falls
  // back to the DB value if the Stripe fetch itself fails.
  let status: string = sub.status;

  // Track C2: whether they're skipping this calendar month is our own data
  // (monthly_skips), not Stripe's pause_collection — query it up front so a
  // Stripe fetch failure below (caught and logged, non-fatal) doesn't also
  // take this down with it.
  const monthDate = monthToDate(currentMonth());
  const { data: skipRow } = await supabase
    .from("monthly_skips")
    .select("id")
    .eq("member_id", authed.memberId)
    .eq("month", monthDate)
    .maybeSingle();
  const is_skipping_this_month = skipRow !== null;

  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
      { expand: ["items.data.price"] }
    );
    const item = stripeSub.items.data[0];
    status = stripeSub.status;
    cancel_at_period_end = stripeSub.cancel_at_period_end;
    price_lookup_key = item.price.lookup_key ?? null;
    interval_count = item.price.recurring?.interval_count ?? null;

    // Bugfix (billing-simplification-plan.md, Appendix A): this app never gives a
    // member a genuine pre-payment Stripe trial — checkout never sets
    // subscription_data.trial_period_days (app/actions/signup.ts). The only
    // way a subscription's status is ever "trialing" here is
    // extendSubscriptionToNext5th() (lib/subscription-utils.ts) pushing
    // trial_end forward on an already-paying subscription — the signup-time
    // billing-anchor correction, a member skip, a match opt-in, or a
    // free-month grant. In every one of those cases trial_end already IS
    // the member's next real charge, not a "first payment" to project past.
    // Stripe mirrors that onto item.current_period_end while trialing, so
    // no special-casing is needed — a previous version of this code added
    // trial_end + one more full interval on top, overstating "Next billing
    // date" by an entire term (up to 6 months for commitment_6mo) for any
    // member currently sitting in one of these trial_end windows.
    current_period_end = item.current_period_end;
  } catch (e) {
    console.error("Failed to fetch subscription from Stripe:", e);
  }

  return {
    status,
    stripe_subscription_id: sub.stripe_subscription_id,
    stripe_price_id: sub.stripe_price_id,
    price_lookup_key,
    current_period_end,
    cancel_at_period_end,
    is_skipping_this_month,
    interval_count,
  };
}

type ProfileUpdates = Partial<{
  first_name: string;
  last_name: string;
  email: string;
  zipcode: string | null;
  language: string[] | null;
  parent_type: "mom" | "dad" | "anyone";
  availability: Availability | null;
  match_priority: "age" | "proximity" | null;
  children: Child[] | null;
  open_to_second_match: boolean;
}>;

/**
 * Applies a profile update for an already-resolved member. Callers MUST resolve
 * the member id from a verified identity first (never a client-supplied id) —
 * see updateMemberProfile (authed session) and updateOnboardingProfile (Stripe
 * checkout session). Internal helper — not a callable server action.
 */
async function applyMemberProfileUpdate(
  memberId: string,
  currentEmail: string,
  updates: ProfileUpdates
) {
  const supabase = createAdminClient();

  // Normalize incoming email to lowercase
  if (updates.email) {
    updates = { ...updates, email: updates.email.toLowerCase() };
  }

  const emailChanged =
    updates.email !== undefined && updates.email !== currentEmail.toLowerCase();

  // Proactively reject duplicate emails before touching the DB
  if (emailChanged && updates.email) {
    const { data: existing } = await supabase
      .from("members")
      .select("id")
      .eq("email", updates.email)
      .single();
    if (existing) {
      throw new Error("That email is already associated with another account.");
    }
  }

  const { error } = await supabase
    .from("members")
    .update(updates)
    .eq("id", memberId);

  if (error) throw new Error("Failed to update profile");

  // Sync new email to Stripe customer for receipts/invoices
  // NOTE: Supabase Auth user email is not updated here — that requires
  // storing user_id on members and calling supabase.auth.admin.updateUserById.
  // For now, the next magic link generation will use the new email from
  // the members table, creating a new auth user if needed.
  if (emailChanged) {
    const { data: member } = await supabase
      .from("members")
      .select("stripe_customer_id")
      .eq("id", memberId)
      .single();

    if (member?.stripe_customer_id) {
      try {
        const stripe = getStripe();
        await stripe.customers.update(member.stripe_customer_id, { email: updates.email });
      } catch (e) {
        console.error("Failed to sync email to Stripe:", e);
      }
    }
  }

  if ("zipcode" in updates) {
    if (updates.zipcode) {
      void geocodeZipcode(updates.zipcode).then(async (coords) => {
        if (!coords) return;
        await supabase
          .from("members")
          .update({ lat: coords.lat, lng: coords.lng })
          .eq("id", memberId);
      }).catch((e) => console.error("Failed to geocode zipcode:", e));
    } else {
      void supabase
        .from("members")
        .update({ lat: null, lng: null })
        .eq("id", memberId)
        .then(() => {}, (e) => console.error("Failed to clear geocoords:", e));
    }
  }
}

/**
 * Authenticated profile edit (the /profile page). Identity comes from the
 * verified session token — the client-supplied member id is gone (audit
 * Finding 1).
 */
export async function updateMemberProfile(
  accessToken: string,
  updates: ProfileUpdates
) {
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not signed in");
  return applyMemberProfileUpdate(authed.memberId, authed.email, updates);
}

/**
 * Onboarding profile save (the /success page). No auth session exists yet, so
 * identity is proven by the Stripe Checkout Session id (present only in the
 * member's own return URL) rather than a client-supplied id — same anchor as
 * getOnboardingSignInLink.
 */
export async function updateOnboardingProfile(
  sessionId: string,
  updates: ProfileUpdates
) {
  const supabase = createAdminClient();

  let memberId: string | undefined;
  let email = "";
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const verified =
      session.status === "complete" || session.payment_status === "paid";
    const id = session.metadata?.member_id;
    if (verified && id) {
      memberId = id;
      const { data: m } = await supabase
        .from("members")
        .select("email")
        .eq("id", id)
        .single();
      email = m?.email?.toLowerCase() ?? "";
    }
  } catch (e) {
    console.error("[updateOnboardingProfile] session verification failed:", e);
  }

  if (!memberId) throw new Error("Could not verify checkout session");
  return applyMemberProfileUpdate(memberId, email, updates);
}

export async function getCustomerPortalUrl(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com"}/profile`,
  });
  return session.url;
}
