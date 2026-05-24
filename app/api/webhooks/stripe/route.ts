import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";
import { sendWelcomeEmail, sendUnsubscribedEmail } from "@/lib/emails";

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
    try {
    const session = event.data.object as Stripe.Checkout.Session;
    const memberId = session.metadata?.member_id;
    const email = session.customer_details?.email;

    console.log("[webhook] checkout.session.completed", { memberId, email, subscription: session.subscription });

    if (!memberId || !session.subscription || !email) {
      console.log("[webhook] missing required fields, skipping");
      return NextResponse.json({ received: true });
    }

    // Retrieve subscription from Stripe to get price_id
    const stripeSubscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );
    const priceId = stripeSubscription.items.data[0].price.id;
    console.log("[webhook] retrieved stripe subscription", { priceId });

    const supabase = createAdminClient();

    const { error: memberError } = await supabase
      .from("members")
      .update({ status: "active" })
      .eq("id", memberId);
    console.log("[webhook] member update", { error: memberError?.message });

    const { error: subError } = await supabase.from("subscriptions").upsert(
      {
        member_id: memberId,
        stripe_subscription_id: session.subscription as string,
        stripe_price_id: priceId,
        status: "active",
      },
      { onConflict: "stripe_subscription_id" }
    );
    console.log("[webhook] subscription upsert", { error: subError?.message });

    // Generate a magic link so the welcome email signs the user straight into their profile
    const firstName = session.customer_details?.name?.split(" ")[0] ?? "there";
    const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL}/profile`;
    let profileLink = redirectTo;
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      profileLink = linkData?.properties?.action_link ?? redirectTo;
    } catch (e) {
      console.error("[webhook] generateLink failed, falling back to plain profile URL:", e);
    }

    // Send welcome email via Resend
    try {
      await sendWelcomeEmail(email, firstName, profileLink);
      console.log("[webhook] welcome email sent to", email);
    } catch (e) {
      // Non-fatal — log and continue. Member is subscribed; email failure shouldn't block.
      console.error("[webhook] sendWelcomeEmail failed (non-fatal):", e);
    }
    } catch (e) {
      console.error("[webhook] unhandled error in checkout.session.completed handler:", e);
      // Return 200 so Stripe doesn't retry — manual investigation needed.
      return NextResponse.json({ received: true, error: "handler_error" });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const supabase = createAdminClient();

    await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("stripe_subscription_id", subscription.id);

    // Look up member to send unsubscribed email
    try {
      const { data: member } = await supabase
        .from("members")
        .select("email, first_name")
        .eq("stripe_customer_id", subscription.customer as string)
        .single();

      if (member?.email) {
        await sendUnsubscribedEmail(
          member.email,
          member.first_name ?? "there"
        );
        console.log("[webhook] unsubscribed email sent to", member.email);
      }
    } catch (e) {
      console.error("[webhook] sendUnsubscribedEmail failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ received: true });
}
