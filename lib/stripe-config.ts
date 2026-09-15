import { PRO_PRICE_EUR_CENTS } from "@/lib/pro-pricing";

export type StripeMode = "test" | "live";

export type StripeEnvironment = Record<string, string | undefined>;

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

export function requiredStripeEnvironmentValue(
  environment: StripeEnvironment,
  name: string
) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new StripeConfigurationError(
      `Missing required server environment variable: ${name}`
    );
  }
  return value;
}

export function getStripeModeFromEnvironment(
  environment: StripeEnvironment
): StripeMode {
  const mode = requiredStripeEnvironmentValue(environment, "STRIPE_MODE");
  if (mode !== "test" && mode !== "live") {
    throw new StripeConfigurationError(
      "STRIPE_MODE must be exactly 'test' or 'live'."
    );
  }

  const vercelEnvironment = environment.VERCEL_ENV;
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

  return mode;
}

export function getStripeSecretFromEnvironment(
  environment: StripeEnvironment,
  expectedMode: StripeMode
) {
  const secretKey = requiredStripeEnvironmentValue(
    environment,
    "STRIPE_SECRET_KEY"
  );
  const keyMode = /^(?:sk|rk)_(test|live)_/.exec(secretKey)?.[1];

  if (keyMode !== "test" && keyMode !== "live") {
    throw new StripeConfigurationError(
      "STRIPE_SECRET_KEY is not a recognized Stripe test or live server key."
    );
  }
  if (keyMode !== expectedMode) {
    throw new StripeConfigurationError(
      `STRIPE_SECRET_KEY mode does not match STRIPE_MODE=${expectedMode}.`
    );
  }

  return secretKey;
}

export function getStripePriceIdsFromEnvironment(
  environment: StripeEnvironment
) {
  const priceIds = {
    PRO_MONTHLY: requiredStripeEnvironmentValue(
      environment,
      "STRIPE_PRO_MONTHLY_PRICE_ID"
    ),
    PRO_YEARLY: requiredStripeEnvironmentValue(
      environment,
      "STRIPE_PRO_YEARLY_PRICE_ID"
    ),
    PRO_LIFETIME: requiredStripeEnvironmentValue(
      environment,
      "STRIPE_PRO_LIFETIME_PRICE_ID"
    ),
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

type StripePriceSnapshot = {
  livemode: boolean;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  type: "one_time" | "recurring";
  recurringInterval: string | null;
  recurringIntervalCount: number | null;
  productId: string;
};

export function validateStripeCatalog({
  mode,
  accountId,
  configuredAccountId,
  monthly,
  yearly,
  lifetime,
  product,
}: {
  mode: StripeMode;
  accountId: string;
  configuredAccountId: string;
  monthly: StripePriceSnapshot;
  yearly: StripePriceSnapshot;
  lifetime: StripePriceSnapshot;
  product: { livemode: boolean; active: boolean; name: string };
}) {
  if (accountId !== configuredAccountId) {
    throw new StripeConfigurationError(
      "STRIPE_SECRET_KEY belongs to a different Stripe account than STRIPE_ACCOUNT_ID."
    );
  }

  const expectedLiveMode = mode === "live";
  const configuredPrices = [monthly, yearly, lifetime];
  if (configuredPrices.some((price) => price.livemode !== expectedLiveMode)) {
    throw new StripeConfigurationError(
      `Configured Stripe Price mode does not match STRIPE_MODE=${mode}.`
    );
  }
  if (configuredPrices.some((price) => !price.active)) {
    throw new StripeConfigurationError("All configured Stripe Prices must be active.");
  }
  if (new Set(configuredPrices.map((price) => price.productId)).size !== 1) {
    throw new StripeConfigurationError(
      "All configured Stripe Prices must belong to the same product."
    );
  }
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
    monthly.unitAmount !== PRO_PRICE_EUR_CENTS.monthly ||
    monthly.type !== "recurring" ||
    monthly.recurringInterval !== "month" ||
    monthly.recurringIntervalCount !== 1
  ) {
    throw new StripeConfigurationError(
      "STRIPE_PRO_MONTHLY_PRICE_ID must be €7.99 EUR recurring monthly."
    );
  }
  if (
    yearly.currency !== "eur" ||
    yearly.unitAmount !== PRO_PRICE_EUR_CENTS.yearly ||
    yearly.type !== "recurring" ||
    yearly.recurringInterval !== "year" ||
    yearly.recurringIntervalCount !== 1
  ) {
    throw new StripeConfigurationError(
      "STRIPE_PRO_YEARLY_PRICE_ID must be €59.99 EUR recurring yearly."
    );
  }
  if (
    lifetime.currency !== "eur" ||
    lifetime.unitAmount !== PRO_PRICE_EUR_CENTS.lifetime ||
    lifetime.type !== "one_time"
  ) {
    throw new StripeConfigurationError(
      "STRIPE_PRO_LIFETIME_PRICE_ID must be a €119.99 EUR one-time Price."
    );
  }
}
