# Stripe production launch

Calistheni billing supports three fixed live offers on one active product named
`Calistheni Pro`:

- €4.99 EUR recurring monthly
- €39.99 EUR recurring yearly
- €79.99 EUR one-time Founding Lifetime Pro

The application validates the declared mode, server key, all three Prices,
their shared Product, and every signed webhook Event before processing billing.
Vercel Production requires `STRIPE_MODE=live`; live runtime keys are rejected in
local, Preview, and Development deployments.

## Vercel Production environment

Set these values for the **Production** environment only:

```dotenv
STRIPE_MODE=live
STRIPE_ACCOUNT_ID=acct_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_PRO_LIFETIME_PRICE_ID=price_...
AUTH_URL=https://calistheni.app
NEXT_PUBLIC_SITE_URL=https://calistheni.app
```

`VERCEL_ENV` is supplied by Vercel and must not be created manually. The Stripe
publishable key is not required by the current server-created Checkout flow. If
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` remains configured, it must be a live key in
Production; the runtime rejects a mismatched optional publishable key.
After changing any variable, redeploy Production so serverless functions receive
the new configuration.

Do not expose the live variables to Preview or Development. Those environments
must use `STRIPE_MODE=test` with a complete sandbox key/Price/webhook set if
billing is enabled there.

## Live catalog setup

The live setup script has three independent guards:

1. A live-only server key supplied as `STRIPE_LIVE_SECRET_KEY`.
2. A confirmed Calistheni `acct_...` ID supplied as `STRIPE_LIVE_ACCOUNT_ID`.
3. Both an exact confirmation environment value and command-line flag.

Supply the key without echoing it, verify the account ID in the Stripe Dashboard,
then run:

```bash
read -s STRIPE_LIVE_SECRET_KEY
export STRIPE_LIVE_SECRET_KEY
export STRIPE_LIVE_ACCOUNT_ID=acct_...
export CONFIRM_STRIPE_LIVE_SETUP=CREATE_CALISTHENI_LIVE_PRICES
npm run stripe:setup:live
unset STRIPE_LIVE_SECRET_KEY CONFIRM_STRIPE_LIVE_SETUP
```

The script searches the authenticated live account first and reuses exact active
objects. It creates no Customer, Checkout Session, PaymentIntent, or charge.

## Production webhook

Create an account webhook/event destination in Stripe **Live mode**:

```text
https://calistheni.app/api/stripe/webhook
```

Use the current integration API version `2026-06-24.dahlia`, matching the
explicitly pinned Stripe Node SDK configuration.

Select exactly:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy that live endpoint's signing secret into Production
`STRIPE_WEBHOOK_SECRET`. Do not reuse the Stripe CLI or test endpoint secret.

The route verifies the raw-body signature and Event mode. Subscription events
are re-retrieved from Stripe before local synchronization, so delayed or
out-of-order event snapshots cannot overwrite current Stripe state. Lifetime
Checkout synchronization is transactionally idempotent by Checkout Session ID.

## Live Customer Portal

Test and live Customer Portal configurations are separate. In Live mode, enable:

- payment method updates
- subscription cancellation at period end
- billing detail updates as desired

Lifetime Pro never exposes subscription cancellation controls.
