"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

const FIRST20_TOTAL = 20;
const PILOT_ONLY_UNTIL = new Date("2026-07-01");

export type SignupMeta = {
  first20SpotsRemaining: number | null;
  pilotOnly: boolean;
};

export async function getSignupMeta(): Promise<SignupMeta> {
  let first20SpotsRemaining: number | null = null;
  const couponId = process.env.STRIPE_FIRST20_COUPON_ID;
  if (couponId) {
    try {
      const stripe = getStripe();
      const coupon = await stripe.coupons.retrieve(couponId);
      first20SpotsRemaining = Math.max(0, FIRST20_TOTAL - (coupon.times_redeemed ?? 0));
    } catch {
      // non-fatal — SignupForm handles null gracefully
    }
  }
  return { first20SpotsRemaining, pilotOnly: new Date() < PILOT_ONLY_UNTIL };
}

export type SignupFormData = {
  firstName: string;
  lastName: string;
  email: string;
  plan: "standard_monthly" | "commitment_3mo" | "first20_3mo";
};

export type SignupError = { error: string };

export async function signup(data: SignupFormData): Promise<SignupError | void> {
  const supabase = createAdminClient();
  const stripe = getStripe();

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email.toLowerCase(),
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !member) {
    if (error?.code === "23505") {
      return { error: "You're already signed up! Check your email for your sign-in link, or contact us if you need help." };
    }
    return { error: `Something went wrong. Please try again.` };
  }

  // first20_3mo uses the commitment_3mo price with a pre-applied promo code
  const isFirst20 = data.plan === "first20_3mo";
  const priceLookupKey = isFirst20 ? "commitment_3mo" : data.plan;

  const [customer, prices] = await Promise.all([
    stripe.customers.create({
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
      metadata: { member_id: member.id },
    }),
    stripe.prices.list({
      lookup_keys: [priceLookupKey],
      expand: ["data.product"],
    }),
  ]);

  const price = prices.data[0];
  if (!price) throw new Error(`Price not found for plan: ${priceLookupKey}`);

  await supabase
    .from("members")
    .update({ stripe_customer_id: customer.id })
    .eq("id", member.id);

  const taxEnabled = new Date() < new Date("2026-07-01T00:00:00Z");

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    // Pre-apply FIRST20 coupon — can't combine with allow_promotion_codes
    ...(isFirst20
      ? { discounts: [{ coupon: process.env.STRIPE_FIRST20_COUPON_ID! }] }
      : { allow_promotion_codes: true }
    ),
    automatic_tax: { enabled: taxEnabled },
    customer_update: taxEnabled ? { address: "auto" } : undefined,
    metadata: { member_id: member.id },
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com"}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com"}/?canceled=true`,
  });

  redirect(session.url!);
}
