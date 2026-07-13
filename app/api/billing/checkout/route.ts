import { NextResponse } from "next/server";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import {
  getUserSubscription,
  hasProAccess,
  hasOngoingRecurringSubscription,
  hasRecurringProAccess,
} from "@/lib/entitlements";
import {
  getSafeServerErrorMessage,
  getStripe,
  getValidatedStripeProPriceIds,
} from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site-url";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

const PRO_PLANS = ["PRO_MONTHLY", "PRO_YEARLY", "PRO_LIFETIME"] as const;
type ProPlan = (typeof PRO_PLANS)[number];

function isProPlan(value: unknown): value is ProPlan {
  return PRO_PLANS.includes(value as ProPlan);
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_REQUEST", error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const plan =
    typeof body === "object" && body !== null && "plan" in body
      ? body.plan
      : null;
  if (!isProPlan(plan)) {
    return NextResponse.json(
      { code: "INVALID_PLAN", error: "Choose a valid Pro plan." },
      { status: 400 }
    );
  }

  try {
    const subscription = await getUserSubscription(userId);
    if (subscription?.lifetimePurchasedAt) {
      return NextResponse.json(
        { code: "ALREADY_PRO", error: "You already have Pro access." },
        { status: 409 }
      );
    }
    if (
      plan === "PRO_LIFETIME" &&
      (hasOngoingRecurringSubscription(subscription) ||
        hasRecurringProAccess(subscription))
    ) {
      return NextResponse.json(
        {
          code: "RECURRING_SUBSCRIPTION_MUST_END",
          error:
            "End your current recurring Pro subscription before purchasing Lifetime Pro to avoid double billing.",
        },
        { status: 409 }
      );
    }
    if (hasRecurringProAccess(subscription)) {
      return NextResponse.json(
        { code: "ALREADY_PRO", error: "You already have Pro access." },
        { status: 409 }
      );
    }
    if (hasProAccess(subscription)) {
      return NextResponse.json(
        { code: "ALREADY_PRO", error: "You already have Pro access." },
        { status: 409 }
      );
    }

    const prices = await getValidatedStripeProPriceIds();
    const customer = await getOrCreateStripeCustomer(userId);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: plan === "PRO_LIFETIME" ? "payment" : "subscription",
      customer,
      client_reference_id: userId,
      line_items: [{ price: prices[plan], quantity: 1 }],
      metadata: { userId, plan },
      ...(plan === "PRO_LIFETIME"
        ? { payment_intent_data: { metadata: { userId, plan } } }
        : { subscription_data: { metadata: { userId } } }),
      success_url: new URL(
        "/pro/success?session_id={CHECKOUT_SESSION_ID}",
        getSiteUrl()
      ).toString(),
      cancel_url: new URL("/pro", getSiteUrl()).toString(),
    });

    if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(
      "Stripe Checkout session creation failed:",
      getSafeServerErrorMessage(error)
    );
    return NextResponse.json(
      { code: "CHECKOUT_UNAVAILABLE", error: "Checkout is unavailable right now." },
      { status: 500 }
    );
  }
}
