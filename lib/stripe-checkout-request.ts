import type Stripe from "stripe";

export type StripeCheckoutPlan =
  | "PRO_MONTHLY"
  | "PRO_YEARLY"
  | "PRO_LIFETIME";

export function buildStripeCheckoutSessionParameters({
  plan,
  userId,
  customerId,
  priceId,
  siteUrl,
}: {
  plan: StripeCheckoutPlan;
  userId: string;
  customerId: string;
  priceId: string;
  siteUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const isLifetime = plan === "PRO_LIFETIME";

  return {
    mode: isLifetime ? "payment" : "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId, plan },
    ...(isLifetime
      ? { payment_intent_data: { metadata: { userId, plan } } }
      : { subscription_data: { metadata: { userId } } }),
    success_url: new URL(
      "/pro/success?session_id={CHECKOUT_SESSION_ID}",
      siteUrl
    ).toString(),
    cancel_url: new URL("/pro", siteUrl).toString(),
  };
}
