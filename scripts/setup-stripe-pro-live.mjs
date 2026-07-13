import { ensureStripeProPrices } from "./ensure-stripe-pro-prices.mjs";

const confirmationFlag = "--confirm-create-live-calistheni-prices";
if (!process.argv.includes(confirmationFlag)) {
  throw new Error(`Live setup requires the explicit ${confirmationFlag} flag.`);
}
if (
  process.env.CONFIRM_STRIPE_LIVE_SETUP !==
  "CREATE_CALISTHENI_LIVE_PRICES"
) {
  throw new Error(
    "Set CONFIRM_STRIPE_LIVE_SETUP=CREATE_CALISTHENI_LIVE_PRICES to confirm live object creation."
  );
}
if (!process.env.STRIPE_LIVE_ACCOUNT_ID?.startsWith("acct_")) {
  throw new Error("STRIPE_LIVE_ACCOUNT_ID must identify the confirmed Calistheni account.");
}

const result = await ensureStripeProPrices({
  secretKey: process.env.STRIPE_LIVE_SECRET_KEY,
  expectedMode: "live",
  expectedAccountId: process.env.STRIPE_LIVE_ACCOUNT_ID,
});

console.log(`STRIPE_ACCOUNT_ID=${result.accountId}`);
console.log(`STRIPE_PRO_MONTHLY_PRICE_ID=${result.monthlyPriceId}`);
console.log(`STRIPE_PRO_YEARLY_PRICE_ID=${result.yearlyPriceId}`);
console.log(`STRIPE_PRO_LIFETIME_PRICE_ID=${result.lifetimePriceId}`);
