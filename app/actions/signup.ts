"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

const FIRST20_TOTAL = 20;
const PILOT_ONLY_UNTIL = new Date("2026-07-01");

// Derives origin from the request so Stripe redirects work on any local port.
// Falls back to the configured env var in production (behind a reverse proxy,
// the host header reflects the internal host rather than the public origin).
async function getBaseUrl(): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    return process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
  }
  const headersList = await headers();
  const host = headersList.get("host");
  return host ? `http://${host}` : (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
}

export type SignupMeta = {
  first20SpotsRemaining: number | null;
  pilotOnly: boolean;
};

export async function getSignupMeta(): Promise<SignupMeta> {
  let first20SpotsRemaining: number | null = null;
  const priceId = process.env.STRIPE_FOUNDING_MEMBER_PRICE_ID;
  if (priceId) {
    try {
      const supabase = createAdminClient();
      const { count } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("stripe_price_id", priceId)
        .neq("status", "canceled");
      first20SpotsRemaining = Math.max(0, FIRST20_TOTAL - (count ?? 0));
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
  giftCode?: string;
};

export type SignupError = { error: string };

export async function signup(data: SignupFormData): Promise<SignupError | void> {
  const supabase = createAdminClient();
  const stripe = getStripe();

  let promotionCodeId: string | undefined;
  if (data.giftCode) {
    const { data: giftCard } = await supabase
      .from("gift_cards")
      .select("stripe_promotion_code_id, redeemed_at")
      .eq("code", data.giftCode)
      .single();
    if (!giftCard) return { error: "This gift card code is not valid." };
    if (giftCard.redeemed_at) return { error: "This gift card has already been redeemed." };
    promotionCodeId = giftCard.stripe_promotion_code_id;
  }

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
      // Email already exists — allow restart if they abandoned a previous checkout
      const { data: existing } = await supabase
        .from("members")
        .select("id, status, stripe_customer_id")
        .eq("email", data.email.toLowerCase())
        .single();

      if (existing?.status === "pending" || existing?.status === "abandoned") {
        return restartCheckout(existing.id, existing.stripe_customer_id, data, promotionCodeId);
      }

      return { error: "You're already signed up! Check your email for your sign-in link, or contact us if you need help." };
    }
    return { error: `Something went wrong. Please try again.` };
  }

  const isFirst20 = data.plan === "first20_3mo";
  const priceLookupKey = isFirst20 ? "founding_member" : data.plan;

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

  await createCheckoutSession(member.id, customer.id, price.id, isFirst20, stripe, promotionCodeId);
}

// Resets an abandoned/pending member back to pending and sends them to a new checkout session.
async function restartCheckout(
  memberId: string,
  stripeCustomerId: string | null,
  data: SignupFormData,
  promotionCodeId?: string
): Promise<SignupError | void> {
  const supabase = createAdminClient();
  const stripe = getStripe();

  await supabase
    .from("members")
    .update({ first_name: data.firstName, last_name: data.lastName, status: "pending" })
    .eq("id", memberId);

  const isFirst20 = data.plan === "first20_3mo";
  const priceLookupKey = isFirst20 ? "founding_member" : data.plan;

  let customerId: string;
  if (stripeCustomerId) {
    customerId = stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
      metadata: { member_id: memberId },
    });
    customerId = customer.id;
    await supabase.from("members").update({ stripe_customer_id: customerId }).eq("id", memberId);
  }

  const prices = await stripe.prices.list({ lookup_keys: [priceLookupKey], expand: ["data.product"] });
  const price = prices.data[0];
  if (!price) throw new Error(`Price not found for plan: ${priceLookupKey}`);

  await createCheckoutSession(memberId, customerId, price.id, isFirst20, stripe, promotionCodeId);
}

async function createCheckoutSession(
  memberId: string,
  customerId: string,
  priceId: string,
  isFirst20: boolean,
  stripe: ReturnType<typeof getStripe>,
  promotionCodeId?: string
): Promise<void> {
  const taxEnabled = new Date() < new Date("2026-07-01T00:00:00Z");

  const discountOption = promotionCodeId
    ? { discounts: [{ promotion_code: promotionCodeId }] }
    : (!isFirst20 ? { allow_promotion_codes: true } : {});

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...discountOption,
    automatic_tax: { enabled: taxEnabled },
    customer_update: taxEnabled ? { address: "auto" } : undefined,
    metadata: { member_id: memberId },
    success_url: `${await getBaseUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${await getBaseUrl()}/canceled?session_id={CHECKOUT_SESSION_ID}`,
  });

  redirect(session.url!);
}

// Marks a member as abandoned when they navigate away from Stripe checkout.
// Called server-side when the cancel_url lands back on the homepage with a session ID.
export async function abandonCheckout(sessionId: string): Promise<void> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const memberId = session.metadata?.member_id;
    if (!memberId) return;

    const supabase = createAdminClient();
    await supabase
      .from("members")
      .update({ status: "abandoned" })
      .eq("id", memberId)
      .eq("status", "pending");
  } catch {
    // non-fatal — best-effort marking
  }
}
