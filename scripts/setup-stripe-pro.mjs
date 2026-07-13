import { ensureStripeProPrices } from "./ensure-stripe-pro-prices.mjs";

if (process.env.STRIPE_MODE !== "test") {
  throw new Error("Test setup requires STRIPE_MODE=test.");
}

const result = await ensureStripeProPrices({
  secretKey: process.env.STRIPE_SECRET_KEY,
  expectedMode: "test",
});

console.log(`STRIPE_ACCOUNT_ID=${result.accountId}`);
console.log(`STRIPE_PRO_MONTHLY_PRICE_ID=${result.monthlyPriceId}`);
console.log(`STRIPE_PRO_YEARLY_PRICE_ID=${result.yearlyPriceId}`);
console.log(`STRIPE_PRO_LIFETIME_PRICE_ID=${result.lifetimePriceId}`);
