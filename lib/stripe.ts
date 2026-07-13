import "server-only";

import Stripe from "stripe";

export type StripeMode = "test" | "live";

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

let stripeClient: Stripe | null = null;
let validatedPricesPromise:
  | Promise<ReturnType<typeof getStripeProPriceIds>>
  | null = null;

function requiredServerEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new StripeConfigurationError(
      `Missing required server environment variable: ${name}`
    );
  }

  return value;
}

export function getStripeMode(): StripeMode {
  const mode = requiredServerEnv("STRIPE_MODE");
  if (mode !== "test" && mode !== "live") {
    throw new StripeConfigurationError(
      "STRIPE_MODE must be exactly 'test' or 'live'."
    );
  }

  const vercelEnvironment = process.env.VERCEL_ENV;
  if (vercelEnvironment === "production" && mode !== "live") {
    throw new StripeConfigurationError(
      "Vercel Production requires STRIPE_MODE=live."
    );
  }
  if (mode === "live" && vercelEnvironment !== "production") {
    throw new StripeConfigurationError(
      "Live Stripe runtime access is allowed only in Vercel Production."
    );
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (publishableKey) {
    const publishableMode = /^pk_(test|live)_/.exec(publishableKey)?.[1];
    if (!publishableMode || publishableMode !== mode) {
      throw new StripeConfigurationError(
        `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY mode does not match STRIPE_MODE=${mode}.`
      );
    }
  }

  return mode;
}

function getSecretKeyMode(secretKey: string): StripeMode | null {
  const match = /^(?:sk|rk)_(test|live)_/.exec(secretKey);
  return match?.[1] === "test" || match?.[1] === "live"
    ? match[1]
    : null;
}

export function getStripe() {
  const expectedMode = getStripeMode();
  const secretKey = requiredServerEnv("STRIPE_SECRET_KEY");
  const keyMode = getSecretKeyMode(secretKey);

  if (!keyMode) {
    throw new StripeConfigurationError(
      "STRIPE_SECRET_KEY is not a recognized Stripe test or live server key."
    );
  }
  if (keyMode !== expectedMode) {
    throw new StripeConfigurationError(
      `STRIPE_SECRET_KEY mode does not match STRIPE_MODE=${expectedMode}.`
    );
  }

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
  const priceIds = {
    PRO_MONTHLY: requiredServerEnv("STRIPE_PRO_MONTHLY_PRICE_ID"),
    PRO_YEARLY: requiredServerEnv("STRIPE_PRO_YEARLY_PRICE_ID"),
    PRO_LIFETIME: requiredServerEnv("STRIPE_PRO_LIFETIME_PRICE_ID"),
  } as const;

  for (const [name, value] of Object.entries(priceIds)) {
    if (!/^price_[A-Za-z0-9]+$/.test(value)) {
      throw new StripeConfigurationError(
        `${name} is not a valid Stripe Price ID.`
      );
    }
  }

  if (new Set(Object.values(priceIds)).size !== 3) {
    throw new StripeConfigurationError(
      "Monthly, Yearly, and Lifetime Stripe Price IDs must be distinct."
    );
  }

  return priceIds;
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
  const expectedLiveMode = mode === "live";
  const priceIds = getStripeProPriceIds();
  const [account, monthly, yearly, lifetime] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.prices.retrieve(priceIds.PRO_MONTHLY),
    stripe.prices.retrieve(priceIds.PRO_YEARLY),
    stripe.prices.retrieve(priceIds.PRO_LIFETIME),
  ]);

  if (account.id !== getStripeAccountId()) {
    throw new StripeConfigurationError(
      "STRIPE_SECRET_KEY belongs to a different Stripe account than STRIPE_ACCOUNT_ID."
    );
  }

  const configuredPrices = [monthly, yearly, lifetime];
  if (configuredPrices.some((price) => price.livemode !== expectedLiveMode)) {
    throw new StripeConfigurationError(
      `Configured Stripe Price mode does not match STRIPE_MODE=${mode}.`
    );
  }
  if (configuredPrices.some((price) => !price.active)) {
    throw new StripeConfigurationError("All configured Stripe Prices must be active.");
  }

  const productIds = configuredPrices.map((price) =>
    typeof price.product === "string" ? price.product : price.product.id
  );
  if (new Set(productIds).size !== 1) {
    throw new StripeConfigurationError(
      "All configured Stripe Prices must belong to the same product."
    );
  }

  const product = await stripe.products.retrieve(productIds[0]);
  if (
    product.livemode !== expectedLiveMode ||
    !product.active ||
    product.name !== "Calistheni Pro"
  ) {
    throw new StripeConfigurationError(
      "Configured Stripe Prices must belong to the active Calistheni Pro product in the selected mode."
    );
  }

  if (
    monthly.currency !== "eur" ||
    monthly.unit_amount !== 499 ||
    monthly.type !== "recurring" ||
    monthly.recurring?.interval !== "month" ||
    monthly.recurring.interval_count !== 1
  ) {
    throw new StripeConfigurationError(
      "STRIPE_PRO_MONTHLY_PRICE_ID must be €4.99 EUR recurring monthly."
    );
  }
  if (
    yearly.currency !== "eur" ||
    yearly.unit_amount !== 3999 ||
    yearly.type !== "recurring" ||
    yearly.recurring?.interval !== "year" ||
    yearly.recurring.interval_count !== 1
  ) {
    throw new StripeConfigurationError(
      "STRIPE_PRO_YEARLY_PRICE_ID must be €39.99 EUR recurring yearly."
    );
  }
  if (
    lifetime.currency !== "eur" ||
    lifetime.unit_amount !== 7999 ||
    lifetime.type !== "one_time"
  ) {
    throw new StripeConfigurationError(
      "STRIPE_PRO_LIFETIME_PRICE_ID must be a €79.99 EUR one-time Price."
    );
  }

  return priceIds;
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
