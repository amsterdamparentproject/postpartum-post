"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

export type SignupFormData = {
  firstName: string;
  lastName: string;
  email: string;
  zipcode: string;
  topic: "just-coffee" | "newborn-chats";
  language: "english" | "dutch" | "either";
  plan: "standard_monthly" | "commitment_6mo";
};

export async function signup(data: SignupFormData) {
  const supabase = createAdminClient();
  const stripe = getStripe();

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      zipcode: data.zipcode,
      topic: data.topic,
      language: data.language,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !member) {
    throw new Error("Failed to create member record");
  }

  const customer = await stripe.customers.create({
    email: data.email,
    name: `${data.firstName} ${data.lastName}`,
    metadata: { member_id: member.id },
  });

  await supabase
    .from("members")
    .update({ stripe_customer_id: customer.id })
    .eq("id", member.id);

  const prices = await stripe.prices.list({
    lookup_keys: [data.plan],
    expand: ["data.product"],
  });
  const price = prices.data[0];
  if (!price) throw new Error(`Price not found for plan: ${data.plan}`);

  const taxEnabled = new Date() < new Date("2026-07-01T00:00:00Z");

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    automatic_tax: { enabled: taxEnabled },
    metadata: { member_id: member.id },
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?cancelled=true`,
  });

  redirect(session.url!);
}
