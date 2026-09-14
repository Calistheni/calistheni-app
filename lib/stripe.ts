import "server-only";

import Stripe from "stripe";
import {
  StripeConfigurationError,
  type StripeMode,
  getStripeModeFromEnvironment,
  getStripePriceIdsFromEnvironment,
  getStripeSecretFromEnvironment,
  requiredStripeEnvironmentValue,
  validateStripeCatalog,
} from "@/lib/stripe-config";

export { StripeConfigurationError } from "@/lib/stripe-config";
export type { StripeMode } from "@/lib/stripe-config";

let stripeClient: Stripe | null = null;
let validatedPricesPromise:
  | Promise<ReturnType<typeof getStripeProPriceIds>>
  | null = null;

function requiredServerEnv(name: string) {
  return requiredStripeEnvironmentValue(process.env, name);
}

export function getStripeMode(): StripeMode {
  return getStripeModeFromEnvironment(process.env);
}

export function getStripe() {
  const expectedMode = getStripeMode();
  const secretKey = getStripeSecretFromEnvironment(process.env, expectedMode);

  stripeClient ??= new Stripe(secretKey, {
    apiVersion: "2026-06-24.dahlia",
  });
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = requiredServerEnv("STRIPE_WEBHOOK_SECRET");
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret)) {
    throw new StripeConfigurationError(
      "STRIPE_WEBHOOK_SECRET is not a valid Stripe endpoint signing secret."
    );
  }
  return secret;
}

export function getStripeProPriceIds() {
  return getStripePriceIdsFromEnvironment(process.env);
}

function getStripeAccountId() {
  const accountId = requiredServerEnv("STRIPE_ACCOUNT_ID");
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    throw new StripeConfigurationError(
      "STRIPE_ACCOUNT_ID is not a valid Stripe account ID."
    );
  }
  return accountId;
}

async function validateStripePrices() {
  const stripe = getStripe();
  const mode = getStripeMode();
  const priceIds = getStripeProPriceIds();
  const [account, monthly, yearly, lifetime] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.prices.retrieve(priceIds.PRO_MONTHLY),
    stripe.prices.retrieve(priceIds.PRO_YEARLY),
    stripe.prices.retrieve(priceIds.PRO_LIFETIME),
  ]);

  const configuredPrices = [monthly, yearly, lifetime];
  const productIds = configuredPrices.map((price) =>
    typeof price.product === "string" ? price.product : price.product.id
  );
  const product = await stripe.products.retrieve(productIds[0]);
  validateStripeCatalog({
    mode,
    accountId: account.id,
    configuredAccountId: getStripeAccountId(),
    monthly: toPriceSnapshot(monthly),
    yearly: toPriceSnapshot(yearly),
    lifetime: toPriceSnapshot(lifetime),
    product: {
      livemode: product.livemode,
      active: product.active,
      name: product.name,
    },
  });

  return priceIds;
}

function toPriceSnapshot(price: Stripe.Price) {
  return {
    livemode: price.livemode,
    active: price.active,
    currency: price.currency,
    unitAmount: price.unit_amount,
    type: price.type,
    recurringInterval: price.recurring?.interval ?? null,
    recurringIntervalCount: price.recurring?.interval_count ?? null,
    productId:
      typeof price.product === "string" ? price.product : price.product.id,
  };
}

export async function getValidatedStripeProPriceIds() {
  const validation = validatedPricesPromise ?? validateStripePrices();
  validatedPricesPromise = validation;

  try {
    return await validation;
  } catch (error) {
    if (validatedPricesPromise === validation) validatedPricesPromise = null;
    throw error;
  }
}

export function assertStripeEventMode(event: Stripe.Event) {
  const expectedLiveMode = getStripeMode() === "live";
  if (event.livemode !== expectedLiveMode) {
    throw new StripeConfigurationError(
      "Signed Stripe event mode does not match the configured runtime mode."
    );
  }
}

export function isStripeConfigurationError(
  error: unknown
): error is StripeConfigurationError {
  return error instanceof StripeConfigurationError;
}

export function getSafeServerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
