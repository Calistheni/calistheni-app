# Apple In-App Purchase foundation

Calistheni uses one server-authoritative Pro entitlement with independent billing grants:

- Web purchases remain in Stripe and continue to use `Subscription`.
- iOS purchases are verified by the backend and stored in the Apple-specific tables.
- Feature authorization calls `getUserEntitlements()` and does not choose a billing provider.
- A valid grant from either provider makes the user Pro. Loss of one grant cannot cancel a valid grant from the other provider.

The server foundation is paired with a first-party Capacitor StoreKit 2 plugin. The web purchase path remains Stripe; the native iOS purchase path is selected structurally and never falls back to Stripe when the native plugin is missing or StoreKit products are unavailable.

## Products and environments

Bundle ID: `com.petershikrenov.calistheni`

- Monthly subscription: `com.petershikrenov.calistheni.pro.monthly`
- Yearly subscription: `com.petershikrenov.calistheni.pro.yearly`
- Lifetime non-consumable: `com.petershikrenov.calistheni.pro.lifetime`

Monthly and yearly belong to the `Calistheni Pro` subscription group at the same service level. Lifetime is outside that group. Family Sharing is disabled initially.

Every Apple account, transaction, aggregate, and notification retains its Apple environment. `SANDBOX` records can be stored for TestFlight diagnostics, but only `PRODUCTION` Apple purchases participate in normal Pro authorization.

## Persistence

- `AppleBillingAccount` owns one stable random UUID `appAccountToken` per Calistheni user.
- `AppleTransaction` is append-only verified transaction history, unique by Apple environment and transaction ID.
- `ApplePurchase` is the current aggregate for an original transaction chain, unique by environment and original transaction ID.
- `AppleServerNotification` records notification UUIDs, payload hashes, processing state, and safe errors for replay protection and audit.

No Apple table replaces or rewrites Stripe state. The additive migration is `20260915120000_add_apple_iap_foundation`.

## Server verification and ownership

The backend uses Apple's official `@apple/app-store-server-library` and `SignedDataVerifier`. Separate cached verifiers are constructed for Production and Sandbox using Apple's public root certificates from [Apple PKI](https://www.apple.com/certificateauthority/). The unverified JWS environment claim is used only to select one strict verifier; there is no Production-to-Sandbox fallback.

Verified transactions must have the configured bundle ID, explicit matching environment, an allowlisted product and matching StoreKit product type, a valid signed date, and a UUID `appAccountToken`. Family-shared ownership is rejected while Family Sharing is disabled.

The token is created server-side and returned only to an authenticated user. It is passed to StoreKit as `appAccountToken` in the future native phase. On synchronization, the verified token—not a browser-supplied user ID—resolves ownership. Unique database constraints and serializable writes prevent a transaction or original transaction chain from moving between users. Duplicate submissions are idempotent.

## API foundation

- `GET /api/billing/apple/config` requires a Calistheni session and returns only the stable `appAccountToken` and allowed product IDs.
- `POST /api/billing/apple/transactions/sync` requires a session, verifies signed StoreKit transaction JWS values, enforces ownership, persists them idempotently, updates aggregates monotonically, and returns safe entitlement status. The native plugin will finish transactions only after this endpoint acknowledges durable processing.
- `POST /api/billing/apple/notifications` is unauthenticated because Apple calls it. It cryptographically verifies the V2 `signedPayload` and nested signed data, records the notification durably, and applies only verified newer state.

Notifications such as subscription creation/renewal/failure/expiration, renewal changes, grace-period expiration, refunds, refund reversals, revocation, renewal extension, price increase, and one-time charges are handled according to their verified transaction and renewal facts rather than granting or revoking from the notification name alone. `TEST` is audit-only and never grants Pro. A later App Store Server API reconciliation job can use the included environment-specific client factory when a notification does not contain enough current state.

## Entitlement rules

Stripe behavior is preserved. Stripe lifetime or an active/trialing recognized recurring plan grants Pro.

An Apple grant exists only for a Production record with an approved product:

- Lifetime grants while active and not revoked/refunded.
- A subscription grants while `expiresAt` is strictly in the future.
- A verified billing grace period grants only while `gracePeriodExpiresAt` is strictly in the future.
- Turning off auto-renew does not remove already-paid access.
- Billing retry without a valid grace period does not grant access indefinitely.
- Revoked, expired, and Sandbox records do not grant ordinary Production Pro.

The resolver unions all valid grants, so an Apple expiration cannot remove valid Stripe access and a Stripe expiration cannot remove valid Apple access.

## Required Vercel configuration

Configure these server variables before enabling the native phase:

- `APPLE_BUNDLE_ID` — `com.petershikrenov.calistheni`
- `APPLE_APP_ID` — numeric App Store Apple ID (required by Production verification)
- `APPLE_IAP_KEY_ID` — App Store Connect In-App Purchase key ID
- `APPLE_IAP_ISSUER_ID` — App Store Connect issuer ID
- `APPLE_IAP_PRIVATE_KEY` — PEM private key, server-only
- `APPLE_PRO_MONTHLY_PRODUCT_ID`
- `APPLE_PRO_YEARLY_PRODUCT_ID`
- `APPLE_PRO_LIFETIME_PRODUCT_ID`

Product IDs default to, and are validated against, the approved values above. The private key must never use a `NEXT_PUBLIC_` prefix or be returned by an API. The key/issuer/private-key settings are lazy and are required only when the App Store Server API client is used; signed transaction verification itself uses Apple's certificate chain and `APPLE_APP_ID` for Production.

## App Store Connect work still required

1. Complete Paid Applications agreements, tax, and banking prerequisites.
2. Create the `Calistheni Pro` subscription group.
3. Create monthly and yearly auto-renewable subscriptions in that group at the same service level.
4. Create the lifetime non-consumable outside the group.
5. Configure storefront prices, localizations, descriptions, and review material; keep Family Sharing off.
6. Enable Billing Grace Period and select the intended environments.
7. Create the App Store Connect In-App Purchase key and configure the server variables securely.
8. Configure App Store Server Notifications V2 Production and Sandbox URLs to `/api/billing/apple/notifications` after deployment.
9. Submit the first IAPs with an app version as required by App Review.

## Native StoreKit architecture

`CalistheniStoreKitPlugin` is a first-party Capacitor plugin implemented with StoreKit 2. It exposes availability, product loading, purchase, current entitlements, explicit restore, transaction finishing, subscription management, and one `transactionUpdated` listener. Product loading is restricted to the three approved identifiers and sends StoreKit's localized `displayPrice` to the web UI.

The purchase flow obtains the authenticated user's stable token from `/api/billing/apple/config` and passes its UUID through StoreKit's `.appAccountToken` purchase option. A locally verified success returns the signed transaction JWS, but does not grant Pro or finish the StoreKit transaction. The TypeScript bridge sends the JWS to `/api/billing/apple/transactions/sync`; only a successful, durable backend acknowledgement permits `Transaction.finish()`. A timeout, ownership rejection, or server failure leaves the transaction unfinished so StoreKit can redeliver it.

The Swift plugin owns one long-lived `Transaction.updates` task for its lifecycle. The shared native shell installs one JavaScript listener per app runtime and synchronizes `Transaction.currentEntitlements` plus unfinished transactions at authenticated startup and on a throttled foreground transition. It does not call `AppStore.sync()` automatically. The explicit Restore Purchases action calls `AppStore.sync()`, enumerates verified current/unfinished transactions, sends each JWS to the backend, and finishes only acknowledged transactions.

Client state is keyed to the authenticated Calistheni user. Logout or account switching clears the cached `appAccountToken`, entitlement callback, and in-flight deduplication map. StoreKit can still expose an Apple ID's device entitlements, but the backend verifies the signed token and refuses to reassign a transaction or original transaction chain to another Calistheni account.

## Provider-aware Pro UI

- Browser/web sessions render the existing Stripe Checkout plans and Stripe subscription management.
- Native iOS with the StoreKit plugin renders StoreKit products, localized prices, purchase states, Retry, and Restore Purchases.
- Native iOS without the plugin shows an update-required message and never falls back to web checkout. This protects remotely loaded web code from installed-app version skew.
- Existing unified `isPro` state disables repurchase prompts regardless of whether the active grant came from Stripe or Apple.
- Apple recurring grants open Apple's subscription-management sheet only inside the native Apple surface. Stripe recurring grants retain the Stripe portal on the web surface. Multiple grants remain independent.

## Local StoreKit testing

`ios/App/App/Calistheni.storekit` is a local, unsynchronized Xcode StoreKit configuration containing the approved monthly, yearly, and lifetime identifiers. Its prices are test metadata only; the native UI still reads `Product.displayPrice`. In Xcode, edit the App scheme's **Run > Options > StoreKit Configuration** and select `Calistheni.storekit` for local manual testing. The repository does not activate it in an archive action, so Xcode Cloud and App Store archives are not tied to local test products.

Xcode-local StoreKit transactions are not App Store-signed transactions and therefore are intentionally rejected by the production Apple-root verifier. Local configuration testing covers product loading, the Apple sheet, cancellation/pending behavior, redelivery, and the safe “do not finish on backend failure” path. End-to-end backend acknowledgement requires real App Store Connect products with Sandbox/TestFlight transactions.

TestFlight transactions retain `SANDBOX` environment and can be persisted and inspected, but the ordinary entitlement resolver does not grant Production Pro from them. A narrowly controlled tester policy, if desired, is a separate decision; this implementation does not weaken environment isolation.

## Remaining activation work

Create and configure the three products and subscription group in App Store Connect, configure the Apple server credentials and notification URL in Vercel, apply the additive Prisma migration through the approved production workflow, and ship a native binary containing `CalistheniStoreKitPlugin`. Then test with Sandbox, TestFlight, and Production across purchases, pending/cancelled/failed flows, renewals, expiration, billing retry and grace, refund/revocation, restore, reinstall, multiple devices, Apple ID and Calistheni account switching, duplicate/replayed transactions and notifications, existing Stripe Pro/lifetime users, and strict Sandbox/Production isolation.
