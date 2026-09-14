import { NextResponse } from "next/server";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import { buildStripeCheckoutSessionParameters } from "@/lib/stripe-checkout-request";
import {
  getUserSubscription,
  hasProAccess,
  hasOngoingRecurringSubscription,
  hasRecurringProAccess,
} from "@/lib/entitlements";
import {
  getStripe,
  getValidatedStripeProPriceIds,
} from "@/lib/stripe";
import {
  type CheckoutFailureStage,
  getCheckoutFailureCode,
  getSafeStripeEnvironmentDiagnostics,
  getSafeStripeErrorDiagnostics,
} from "@/lib/stripe-diagnostics";
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

function getBillingInterval(plan: ProPlan) {
  if (plan === "PRO_MONTHLY") return "month";
  if (plan === "PRO_YEARLY") return "year";
  return "one_time";
}

function hasConfiguredPrice(plan: ProPlan) {
  const environmentName =
    plan === "PRO_MONTHLY"
      ? "STRIPE_PRO_MONTHLY_PRICE_ID"
      : plan === "PRO_YEARLY"
        ? "STRIPE_PRO_YEARLY_PRICE_ID"
        : "STRIPE_PRO_LIFETIME_PRICE_ID";
  return Boolean(process.env[environmentName]?.trim());
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

  let stage: CheckoutFailureStage = "subscription_lookup";
  let hasStripeCustomerId = false;
  console.info("[billing.checkout]", {
    event: "request_received",
    userId,
    plan,
    billingInterval: getBillingInterval(plan),
    hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    hasPriceId: hasConfiguredPrice(plan),
    ...getSafeStripeEnvironmentDiagnostics(),
  });

  try {
    const subscription = await getUserSubscription(userId);
    hasStripeCustomerId = Boolean(subscription?.stripeCustomerId);
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

    stage = "stripe_config";
    const stripe = getStripe();
    stage = "price_retrieval";
    const prices = await getValidatedStripeProPriceIds();
    stage = "origin_resolution";
    const siteUrl = getSiteUrl();
    stage = "customer_resolution";
    const customer = await getOrCreateStripeCustomer(userId);
    hasStripeCustomerId = true;
    stage = "checkout_session_creation";
    const session = await stripe.checkout.sessions.create(
      buildStripeCheckoutSessionParameters({
        plan,
        userId,
        customerId: customer,
        priceId: prices[plan],
        siteUrl,
      })
    );

    stage = "checkout_url_validation";
    if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
    console.info("[billing.checkout]", {
      event: "checkout_created",
      userId,
      plan,
      billingInterval: getBillingInterval(plan),
      hasStripeCustomerId,
      checkoutOrigin: new URL(siteUrl).origin,
      ...getSafeStripeEnvironmentDiagnostics(),
      httpStatus: 200,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing.checkout]", {
      event: "checkout_failed",
      stage,
      userId,
      plan,
      billingInterval: getBillingInterval(plan),
      hasStripeSecret: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      hasPriceId: hasConfiguredPrice(plan),
      hasStripeCustomerId,
      ...getSafeStripeEnvironmentDiagnostics(),
      ...getSafeStripeErrorDiagnostics(error),
      httpStatus: 500,
    });
    const code = getCheckoutFailureCode(stage, error);
    return NextResponse.json(
      { code, error: "Checkout is unavailable right now." },
      { status: 500 }
    );
  }
}
