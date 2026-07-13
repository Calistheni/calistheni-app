# Stripe test-mode setup

Calistheni billing is implemented with server-created Stripe Checkout and
Customer Portal sessions. The publishable key is documented for future use but
is not currently required in browser code.

## Environment

Set these server-only values in `.env.local`:

```dotenv
STRIPE_MODE=test
STRIPE_ACCOUNT_ID=acct_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_PRO_LIFETIME_PRICE_ID=price_...
```

Never use live-mode values for local testing.

The runtime retrieves and validates all configured Prices before billing. A
test key, test Prices, and test webhook event are required when
`STRIPE_MODE=test`; mixed test/live configuration fails closed.

The configured Calistheni Pro prices are €4.99 EUR monthly, €39.99 EUR yearly,
and a €79.99 EUR one-time Founding Lifetime Pro purchase. Lifetime access is
granted only by a verified, paid Checkout webhook whose sole line item matches
the configured one-time Lifetime Price ID.

## Local webhooks

Install the Stripe CLI on macOS if needed:

```bash
brew install stripe/stripe-cli/stripe
```

Authenticate and forward test events:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The listener prints a temporary `whsec_...` signing secret. Put it in
`STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart `npm run dev`.

## Customer Portal

In the Stripe Dashboard while viewing TEST MODE, open Billing → Customer portal
and enable payment-method updates and subscription cancellation. Save the portal
configuration before testing the Manage Subscription button.

## Idempotent test catalog setup

With the test values above in `.env.local`, run:

```bash
npm run stripe:setup:test
```

This command refuses live keys.

## Manual Checkout test

Use Stripe's standard successful test card `4242 4242 4242 4242`, any future
expiry date, any three-digit CVC, and any valid postal code. This creates no real
charge in test mode.
