import Stripe from "stripe";

// Pinned on purpose, so a Stripe SDK upgrade never silently changes the API
// version production talks to. The cast keeps the pin compiling across SDK
// majors (the SDK types only accept the newest version string). Move to a newer
// API version deliberately, after reading Stripe's API changelog.
export const STRIPE_API_VERSION = "2026-04-22.dahlia" as unknown as NonNullable<
  ConstructorParameters<typeof Stripe>[1]
>["apiVersion"];

export function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: STRIPE_API_VERSION,
  });
}
