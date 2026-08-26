import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";
import { sendWelcomeEmail, sendUnsubscribedEmail } from "@/lib/emails";
import { extendSubscriptionToNext5th } from "@/lib/subscription-utils";
import { createGiftCard, redeemGiftCard } from "@/lib/gift-cards";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";
import { recordEntitlement, FYP_LOOKUP_KEYS } from "@/lib/match-ledger";

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

    if (session.metadata?.product === "gift_card") {
      await createGiftCard(session);
      return NextResponse.json({ received: true });
    }

    const memberId = session.metadata?.member_id;
    const email = session.customer_details?.email;

    console.log("[webhook] checkout.session.completed", { memberId, email, subscription: session.subscription });

    if (!memberId || !session.subscription || !email) {
      console.log("[webhook] missing required fields, skipping");
      return NextResponse.json({ received: true });
    }

    // Retrieve subscription from Stripe to get price_id and period end.
    // latest_invoice.period_end replaces the removed current_period_end field.
    const stripeSubscription = await stripe.subscriptions.retrieve(
      session.subscription as string,
      { expand: ["latest_invoice", "discounts"] }
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

    // Align billing to the next match day (the 5th) when the subscription's
    // natural anchor (signup date + plan interval, as Stripe computed it at
    // checkout) doesn't already land there — e.g. a 3-month plan signed up
    // on the 6th would otherwise renew on the 6th too, leaving only ~1 day
    // of buffer after that cycle's 3rd match. Gate on the natural anchor's
    // calendar day directly (not on today's date) so an already-aligned
    // subscription is left untouched — no trial_end update, no "trialing"
    // status. Safe to apply post-checkout because extendSubscriptionToNext5th
    // only ever pushes the period end later, never earlier — see
    // __claude__/billing-extension-bugfix-plan.md.
    const naturalAnchor = new Date(stripeSubscription.items.data[0].current_period_end * 1000);
    if (naturalAnchor.getUTCDate() !== 5) {
      try {
        const { newDate } = await extendSubscriptionToNext5th(session.subscription as string);
        console.log("[webhook] billing extended to next 5th-of-month:", newDate.toISOString());
      } catch (e) {
        console.error("[webhook] billing extension failed (non-fatal):", e);
      }
    }

    // Generate a magic link so the welcome email signs the user straight into their profile
    const firstName = session.customer_details?.name?.split(" ")[0] ?? "there";
    const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL}/profile`;
    let profileLink = redirectTo;
    const linkResult = await generateMagicLinkWithRetry(supabase, email, redirectTo);
    if (linkResult.success) {
      profileLink = linkResult.url;
    } else {
      console.error("[webhook] generateLink failed, falling back to plain profile URL:", linkResult.error);
    }

    // Derive human-readable plan label and next billing date for the welcome email.
    const lookupKey = stripeSubscription.items.data[0].price.lookup_key ?? "";
    console.log("[webhook] plan detection", { lookupKey });
    const planLabel =
      lookupKey === "founding_member" ? "Founding Member (€5/mo)" :
      lookupKey === "commitment_3mo" ? "3-month commitment (€8/mo)" :
      lookupKey === "standard_monthly" ? "Monthly (€12/mo)" :
      "Postpartum Post";
    const invoice = stripeSubscription.latest_invoice as Stripe.Invoice | null;
    const periodEndTs = invoice?.period_end ?? stripeSubscription.billing_cycle_anchor;
    const nextBillingDate = new Date(periodEndTs * 1000).toLocaleDateString("en-NL", {
      day: "numeric", month: "long", year: "numeric",
    });

    // Mark gift card as redeemed if a promotion code was applied.
    // discounts[0] is a full Discount object (expanded above); .promotion_code is the string ID.
    const firstDiscount = stripeSubscription.discounts?.[0];
    if (firstDiscount && typeof firstDiscount !== "string") {
      const promoCode = firstDiscount.promotion_code;
      const promoCodeId = typeof promoCode === "string" ? promoCode : promoCode?.id;
      if (promoCodeId) {
        try {
          await redeemGiftCard(promoCodeId);
          console.log("[webhook] gift card redeemed", { promoCodeId });
        } catch (e) {
          console.error("[webhook] redeemGiftCard failed (non-fatal):", e);
        }
      }
    }

    // Send welcome email via Resend
    try {
      await sendWelcomeEmail(email, firstName, profileLink, planLabel, nextBillingDate);
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

  if (event.type === "invoice.payment_succeeded") {
    // Track B (billing simplification, __claude__/billing-simplification-plan.md
    // §3.2): every successful payment — the first one at signup and every
    // renewal after — grants matchesPerTerm to the member's counter. This is
    // write-only for now: nothing reads matches_remaining yet, and this does
    // NOT pause the subscription (that's E2, once a renew-check job exists
    // that can actually resume it — pausing here with nothing to un-pause it
    // would strand every subscription the first time it renews).
    try {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;

      if (!subscriptionId) {
        // Not a subscription invoice (e.g. a one-off) — nothing to credit.
        return NextResponse.json({ received: true });
      }

      const supabase = createAdminClient();
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("member_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();

      if (!sub) {
        console.error("[webhook] invoice.payment_succeeded: no local subscription for", subscriptionId);
        return NextResponse.json({ received: true });
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const price = stripeSubscription.items.data[0]?.price;
      const lookupKey = price?.lookup_key ?? "";

      if (FYP_LOOKUP_KEYS.has(lookupKey)) {
        // FYP's own product shares this Stripe account but is out of scope
        // for the counter (plan §4, §5).
        return NextResponse.json({ received: true });
      }

      const matchesPerTerm = price?.recurring?.interval_count ?? 1;

      const applied = await recordEntitlement(supabase, {
        memberId: sub.member_id,
        event: "term_payment",
        delta: matchesPerTerm,
        stripeInvoiceId: invoice.id,
      });
      console.log("[webhook] invoice.payment_succeeded", { subscriptionId, matchesPerTerm, applied });
    } catch (e) {
      console.error("[webhook] invoice.payment_succeeded handler failed (non-fatal):", e);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const supabase = createAdminClient();

    await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("stripe_subscription_id", subscription.id);

    // Look up member to set inactive and send unsubscribed email.
    // Fires when the billing period actually ends — not at cancel time.
    try {
      const { data: member } = await supabase
        .from("members")
        .select("id, email, first_name")
        .eq("stripe_customer_id", subscription.customer as string)
        .single();

      if (member) {
        await supabase
          .from("members")
          .update({ status: "inactive" })
          .eq("id", member.id);

        if (member.email) {
          await sendUnsubscribedEmail(
            member.email,
            member.first_name ?? "there"
          );
          console.log("[webhook] unsubscribed email sent to", member.email);
        }
      }
    } catch (e) {
      console.error("[webhook] subscription.deleted handler failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ received: true });
}
