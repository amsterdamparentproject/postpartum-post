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

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    metadata: { member_id: member.id },
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?cancelled=true`,
  });

  redirect(session.url!);
}
