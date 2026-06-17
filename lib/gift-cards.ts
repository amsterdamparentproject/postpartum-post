import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";
import { sendGiftCardEmail } from "@/lib/emails";

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "PP-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createGiftCard(session: Stripe.Checkout.Session): Promise<void> {
  const giftMonths = parseInt(session.metadata?.gift_months ?? "0", 10);
  if (!giftMonths || giftMonths < 1) {
    throw new Error(`[gift-cards] invalid gift_months: ${session.metadata?.gift_months}`);
  }

  const buyerEmail = session.customer_details?.email ?? undefined;
  const recipientEmail = session.custom_fields?.find(
    (f) => f.key === "recipientsemail"
  )?.text?.value ?? undefined;
  const emailTarget = recipientEmail ?? buyerEmail;

  const stripe = getStripe();

  const priceId = giftMonths === 3
    ? process.env.STRIPE_3MO_PRICE_ID
    : process.env.STRIPE_MONTHLY_PRICE_ID;
  if (!priceId) {
    throw new Error(`[gift-cards] no price ID configured for gift_months=${giftMonths}`);
  }
  const price = await stripe.prices.retrieve(priceId);
  const productId = typeof price.product === "string" ? price.product : price.product.id;

  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: "repeating",
    duration_in_months: giftMonths,
    applies_to: { products: [productId] },
    metadata: { product: "gift_card" },
  });

  const code = generateCode();
  const promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code,
    max_redemptions: 1,
  });

  const supabase = createAdminClient();
  const { error } = await supabase.from("gift_cards").insert({
    code,
    stripe_coupon_id: coupon.id,
    stripe_promotion_code_id: promotionCode.id,
    buyer_email: buyerEmail ?? null,
    recipient_email: recipientEmail ?? null,
    gift_months: giftMonths,
  });
  if (error) {
    throw new Error(`[gift-cards] supabase insert failed: ${error.message}`);
  }

  if (emailTarget) {
    await sendGiftCardEmail(emailTarget, code, giftMonths);
  }
}

export async function redeemGiftCard(promotionCodeId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("gift_cards")
    .update({ redeemed_at: new Date().toISOString() })
    .eq("stripe_promotion_code_id", promotionCodeId)
    .is("redeemed_at", null);
  if (error) {
    throw new Error(`[gift-cards] redeemGiftCard failed: ${error.message}`);
  }
}
