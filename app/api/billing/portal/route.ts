import { NextResponse } from "next/server";
import {
  getUserSubscription,
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

export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  try {
    const subscription = await getUserSubscription(userId);
    if (subscription?.lifetimePurchasedAt) {
      return NextResponse.json(
        {
          code: "LIFETIME_NO_RENEWAL",
          error: "Lifetime Pro is paid once and has no subscription to cancel.",
        },
        { status: 409 }
      );
    }
    if (!subscription?.stripeCustomerId || !hasRecurringProAccess(subscription)) {
      return NextResponse.json(
        { code: "NO_BILLING_ACCOUNT", error: "No billing account was found." },
        { status: 404 }
      );
    }

    await getValidatedStripeProPriceIds();
    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: new URL("/pro", getSiteUrl()).toString(),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(
      "Stripe Billing Portal session creation failed:",
      getSafeServerErrorMessage(error)
    );
    return NextResponse.json(
      { code: "PORTAL_UNAVAILABLE", error: "Billing management is unavailable right now." },
      { status: 500 }
    );
  }
}
