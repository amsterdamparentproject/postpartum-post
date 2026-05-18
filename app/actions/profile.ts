"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export type Availability = {
  days: string[];
  times: string[];
};

export type MemberProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  zipcode: string | null;
  language: "english" | "dutch" | null;
  topic_id: string | null;
  match_type: "in_person" | "online" | null;
  stripe_customer_id: string | null;
  consecutive_skips: number;
  availability: Availability | null;
  match_priority: "age" | "proximity" | null;
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
};

export async function getMemberProfile(email: string): Promise<MemberProfile | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, zipcode, language, topic_id, match_type, stripe_customer_id, consecutive_skips, availability, match_priority")
    .eq("email", email)
    .single();
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

  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
      { expand: ["items.data.price"] }
    );
    current_period_end = stripeSub.items.data[0].current_period_end;
    cancel_at_period_end = stripeSub.cancel_at_period_end;
    price_lookup_key = stripeSub.items.data[0].price.lookup_key ?? null;
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
    language: "english" | "dutch" | null;
    topic_id: string | null;
    match_type: "in_person" | "online" | null;
    availability: Availability | null;
    match_priority: "age" | "proximity" | null;
  }>
) {
  const supabase = createAdminClient();
  const emailChanged = updates.email !== currentEmail;

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
}

export async function getCustomerPortalUrl(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/profile`,
  });
  return session.url;
}
