import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  assertStripeEventMode,
  getSafeServerErrorMessage,
  getStripe,
  getStripeWebhookSecret,
  getValidatedStripeProPriceIds,
  isStripeConfigurationError,
} from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/stripe-subscriptions";
import { syncStripeLifetimeCheckout } from "@/lib/stripe-lifetime";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret()
    );
  } catch (error) {
    if (isStripeConfigurationError(error)) {
      console.error(
        "Stripe webhook configuration failed:",
        getSafeServerErrorMessage(error)
      );
      return NextResponse.json(
        { error: "Stripe server configuration is invalid." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    assertStripeEventMode(event);
    await getValidatedStripeProPriceIds();

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (subscriptionId) {
        const stripeSubscription = await getStripe().subscriptions.retrieve(
          subscriptionId
        );
        await syncStripeSubscription(
          stripeSubscription,
          session.client_reference_id || session.metadata?.userId
        );
      } else if (
        session.mode === "payment" &&
        session.payment_status === "paid" &&
        session.metadata?.plan === "PRO_LIFETIME"
      ) {
        await syncStripeLifetimeCheckout(session);
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      // Always fetch current Stripe state so delayed/out-of-order deliveries
      // cannot overwrite a newer subscription state with an older snapshot.
      const stripeSubscription = await getStripe().subscriptions.retrieve(
        event.data.object.id
      );
      await syncStripeSubscription(stripeSubscription);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "Stripe webhook processing failed:",
      event.id,
      getSafeServerErrorMessage(error)
    );
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
