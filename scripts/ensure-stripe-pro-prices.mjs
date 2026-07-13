import Stripe from "stripe";

function getKeyMode(secretKey) {
  return /^(?:sk|rk)_test_/.test(secretKey)
    ? "test"
    : /^(?:sk|rk)_live_/.test(secretKey)
      ? "live"
      : null;
}

export async function ensureStripeProPrices({
  secretKey,
  expectedMode,
  expectedAccountId,
}) {
  if (!secretKey) throw new Error("A Stripe server key is required.");
  if (getKeyMode(secretKey) !== expectedMode) {
    throw new Error(`Stripe key mode must be ${expectedMode}.`);
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2026-06-24.dahlia",
  });
  const account = await stripe.accounts.retrieveCurrent();
  if (expectedAccountId && account.id !== expectedAccountId) {
    throw new Error("Authenticated Stripe account does not match the confirmed account ID.");
  }
  const accountName =
    account.business_profile?.name ||
    account.settings?.dashboard?.display_name ||
    "";
  if (accountName.toLowerCase().includes("sinceseven")) {
    throw new Error("Refusing to use the SinceSeven Stripe account.");
  }

  const products = await stripe.products
    .list({ limit: 100 })
    .autoPagingToArray({ limit: 10000 });
  const matchingProducts = products.filter(
    (product) => product.name === "Calistheni Pro"
  );
  if (matchingProducts.length > 1) {
    throw new Error(
      "Multiple Calistheni Pro products exist in this mode; resolve duplicates first."
    );
  }

  const existingProduct = matchingProducts[0];
  const product = existingProduct
    ? existingProduct.active
      ? existingProduct
      : await stripe.products.update(existingProduct.id, { active: true })
    : await stripe.products.create({
        name: "Calistheni Pro",
        metadata: { application: "calistheni" },
      });
  const prices = await stripe.prices
    .list({ product: product.id, limit: 100 })
    .autoPagingToArray({ limit: 10000 });

  async function findOrCreateRecurringPrice(unitAmount, interval) {
    const existing = prices.find(
      (price) =>
        price.currency === "eur" &&
        price.unit_amount === unitAmount &&
        price.type === "recurring" &&
        price.recurring?.interval === interval &&
        price.recurring.interval_count === 1
    );
    if (existing) {
      return existing.active
        ? existing
        : stripe.prices.update(existing.id, { active: true });
    }
    return stripe.prices.create({
      product: product.id,
      currency: "eur",
      unit_amount: unitAmount,
      recurring: { interval },
    });
  }

  const monthly = await findOrCreateRecurringPrice(499, "month");
  const yearly = await findOrCreateRecurringPrice(3999, "year");
  const existingLifetime = prices.find(
    (price) =>
      price.currency === "eur" &&
      price.unit_amount === 7999 &&
      price.type === "one_time"
  );
  const lifetime = existingLifetime
    ? existingLifetime.active
      ? existingLifetime
      : await stripe.prices.update(existingLifetime.id, { active: true })
    : await stripe.prices.create({
        product: product.id,
        currency: "eur",
        unit_amount: 7999,
        nickname: "Founding Lifetime Pro",
      });

  return {
    accountId: account.id,
    productId: product.id,
    monthlyPriceId: monthly.id,
    yearlyPriceId: yearly.id,
    lifetimePriceId: lifetime.id,
  };
}
