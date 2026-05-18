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

    // Generate magic link for profile setup
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/profile`,
      },
    });

    if (error || !data.properties?.action_link) {
      console.error(`[webhook] failed to generate magic link for ${email}:`, error);
      // Return 200 so Stripe doesn't retry — member is active but needs
      // magic link resent manually via Supabase dashboard or admin tool.
      return NextResponse.json({ received: true });
    }

    console.log("[webhook] magic link generated, handing off to n8n");

    // Hand off to n8n for welcome email
    if (process.env.N8N_WELCOME_WEBHOOK_URL) {
      const n8nHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (process.env.N8N_WEBHOOK_SECRET) {
        n8nHeaders["X-N8N-WEBHOOK-SECRET"] = process.env.N8N_WEBHOOK_SECRET;
      }
      try {
        const n8nRes = await fetch(process.env.N8N_WELCOME_WEBHOOK_URL, {
          method: "POST",
          headers: n8nHeaders,
          body: JSON.stringify({
            email,
            magic_link: data.properties.action_link,
          }),
          signal: AbortSignal.timeout(8000), // 8s timeout — don't let n8n hang the whole handler
        });
        console.log("[webhook] n8n response", n8nRes.status);
      } catch (e) {
        console.error("[webhook] n8n fetch failed (non-fatal):", e);
        // Don't rethrow — member is active, magic link was generated.
        // n8n failure should not cause Stripe to retry the whole event.
      }
    } else {
      console.log(`[webhook] N8N_WELCOME_WEBHOOK_URL not set — magic link for ${email}: ${data.properties.action_link}`);
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
  }

  return NextResponse.json({ received: true });
}
