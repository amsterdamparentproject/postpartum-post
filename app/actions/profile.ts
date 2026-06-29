"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { geocodeZipcode } from "@/lib/matcher";

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
  pause_collection: { behavior: string; resumes_at: number | null } | null;
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

export async function getMemberProfile(email: string): Promise<MemberProfile | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, status, zipcode, language, parent_type, stripe_customer_id, consecutive_skips, availability, match_priority, children, open_to_second_match")
    .eq("email", email.toLowerCase())
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

export async function getSubscriptionDetails(memberId: string): Promise<SubscriptionDetails | null> {
  const supabase = createAdminClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, stripe_subscription_id, stripe_price_id")
    .eq("member_id", memberId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) return null;

  let current_period_end: number | null = null;
  let cancel_at_period_end = false;
  let price_lookup_key: string | null = null;
  let pause_collection: { behavior: string; resumes_at: number | null } | null = null;

  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
      { expand: ["items.data.price"] }
    );
    const item = stripeSub.items.data[0];
    cancel_at_period_end = stripeSub.cancel_at_period_end;
    price_lookup_key = item.price.lookup_key ?? null;
    pause_collection = stripeSub.pause_collection
      ? { behavior: stripeSub.pause_collection.behavior, resumes_at: stripeSub.pause_collection.resumes_at ?? null }
      : null;

    // During a trial, current_period_end = trial_end (the first charge date).
    // For the renewal case, show trial_end + interval so "Next billing date"
    // reflects when the subscription auto-renews, not when the first payment hits.
    // Exception: if cancel_at_period_end, the subscription cancels at trial_end —
    // keep that as-is so "Cancels on" shows the actual end date.
    if (
      stripeSub.status === "trialing" &&
      stripeSub.trial_end &&
      !stripeSub.cancel_at_period_end
    ) {
      const recurring = item.price.recurring;
      if (recurring?.interval === "month") {
        const renewal = new Date(stripeSub.trial_end * 1000);
        renewal.setUTCMonth(renewal.getUTCMonth() + (recurring.interval_count ?? 1));
        current_period_end = Math.floor(renewal.getTime() / 1000);
      } else {
        current_period_end = item.current_period_end;
      }
    } else {
      current_period_end = item.current_period_end;
    }
  } catch (e) {
    console.error("Failed to fetch subscription from Stripe:", e);
  }

  return {
    status: sub.status,
    stripe_subscription_id: sub.stripe_subscription_id,
    stripe_price_id: sub.stripe_price_id,
    price_lookup_key,
    current_period_end,
    cancel_at_period_end,
    pause_collection,
  };
}

export async function updateMemberProfile(
  memberId: string,
  currentEmail: string,
  updates: Partial<{
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
  }>
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

export async function getCustomerPortalUrl(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com"}/profile`,
  });
  return session.url;
}
