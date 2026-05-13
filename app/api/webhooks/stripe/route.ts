import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const memberId = session.metadata?.member_id;

    if (!memberId || !session.subscription) {
      return NextResponse.json({ received: true });
    }

    const supabase = createAdminClient();

    await supabase
      .from("members")
      .update({ status: "active" })
      .eq("id", memberId);

    await supabase.from("subscriptions").insert({
      member_id: memberId,
      stripe_subscription_id: session.subscription as string,
      stripe_customer_id: session.customer as string,
      status: "active",
    });
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const supabase = createAdminClient();

    await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_subscription_id", subscription.id);
  }

  return NextResponse.json({ received: true });
}
