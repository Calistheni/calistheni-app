# Multi-provider authentication deployment runbook

This implementation is additive. It does not replace canonical `User` IDs, existing Google `Account` rows, database sessions, subscriptions, Apple purchases, or application data.

## Required server environment

- `AUTH_SECRET` (existing): Auth.js and server HMAC fallback.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (existing), or the Auth.js aliases `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
- `AUTH_APPLE_ID`: Apple Services ID used by the website.
- `AUTH_APPLE_SECRET`: ES256 Apple client-secret JWT for the Services ID. Rotate before its Apple-authorized expiration.
- `APPLE_TEAM_ID`: Apple Developer team identifier.
- `APPLE_AUTH_KEY_ID`: Sign in with Apple key identifier.
- `APPLE_AUTH_PRIVATE_KEY`: server-only `.p8` private key; escaped newlines are accepted.
- `IOS_BUNDLE_ID`: optional override; defaults to `com.petershikrenov.calistheni`.
- `AUTH_TOKEN_ENCRYPTION_KEY`: legacy 32-byte base64url key. Keep configured while any row has a null/`legacy` key identifier.
- `AUTH_TOKEN_ENCRYPTION_KEYS`: JSON object mapping non-secret key IDs to 32-byte base64url keys, for example `{"2026-11":"..."}`. Server-only.
- `AUTH_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`: key ID from `AUTH_TOKEN_ENCRYPTION_KEYS` used for all new Apple tokens and authentication-email outbox records.
- `AUTH_RATE_LIMIT_SECRET`: optional dedicated HMAC secret for durable rate-limit keys. If omitted, `AUTH_SECRET` is used.
- `AUTH_EMAIL_WORKER_SECRET`: dedicated bearer secret for `/api/cron/auth-email`; at least 32 random characters. For an external scheduler, keep it distinct from Vercel `CRON_SECRET` so compromise of the email scheduler cannot authorize another cron route.
- `AUTH_EMAIL_WORKER_ENABLED`: must be exactly `true` before the scheduled worker sends queued messages. It defaults to disabled; leave unset until the migration, secret, and staging checks are complete.
- `ACCOUNT_DELETION_REQUESTS_ENABLED`: must be exactly `true` before the deletion API accepts requests. Defaults to disabled.
- `ACCOUNT_DELETION_WORKER_ENABLED`: must be exactly `true` before the scheduled deletion worker processes accounts. Defaults to disabled.
- `AUTH_EMAIL_BATCH_LIMIT`: optional worker batch size, clamped to 1–10; defaults to 5. Keep the default unless measured mail-provider throughput supports a change within the function duration.
- `RESEND_API_KEY` (existing email infrastructure).
- `AUTH_EMAIL_FROM`: verified sender such as `Calistheni <accounts@calistheni.app>`.
- `APPLE_SANDBOX_ENTITLEMENT_USER_IDS`: normally absent/empty. Comma-separated canonical User IDs only, enabled for a reviewer account only after separate approval.

All variables above are server-only. None use the `NEXT_PUBLIC_` prefix.

## Apple Developer configuration

1. Enable **Sign in with Apple** for App ID `com.petershikrenov.calistheni` without changing the bundle identifier.
2. Create or configure the website Services ID used as `AUTH_APPLE_ID`, group it with the primary App ID, add domain `calistheni.app`, and add return URL `https://calistheni.app/api/auth/callback/apple`.
3. Create a Sign in with Apple key for the team. Store its key ID and `.p8` material only in the server secret store.
4. Regenerate the web client-secret JWT with subject equal to the Services ID, issuer equal to the Team ID, audience `https://appleid.apple.com`, and a permitted expiration. Store it as `AUTH_APPLE_SECRET` and schedule rotation.
5. Regenerate the iOS provisioning profile after enabling the capability. The local project entitlement is already present; certificates and profiles are intentionally not modified here.
6. Configure Apple private-email relay for the domain and the authenticated email sender so Hide My Email users can receive mail. Accept both `privaterelay.appleid.com` and Apple's newer `private.icloud.com` relay addresses as ordinary verified Apple emails.
7. Configure Apple server-to-server notifications for consent changes at `https://calistheni.app/api/auth/apple/notifications`. The handler verifies Apple's JWS, rejects replays by `jti`, marks authorization revoked, and removes only sessions tagged as Apple-authenticated.

## Encryption-key rotation

1. Keep the current `AUTH_TOKEN_ENCRYPTION_KEY` configured as the legacy read key.
2. Add a newly generated key to `AUTH_TOKEN_ENCRYPTION_KEYS` under a unique, non-secret ID and set `AUTH_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` to that ID.
3. Deploy and verify that newly written rows carry the new key ID while existing null-key-ID rows remain decryptable through the legacy key.
4. On a later reviewed maintenance pass, re-encrypt existing Apple authorization and pending email-outbox rows under the active key. Do not rewrite provider identities or user IDs.
5. Remove an old key only after a read-only query proves no remaining row references it. Loss of a referenced key prevents Apple revocation or pending email delivery and is not recoverable from ciphertext.

## Safe deployment order

1. Back up the database and run `npm run auth:email-collision-preflight` read-only against the target database. Resolve collisions manually; do not merge automatically.
2. Configure Apple, email, encryption, and rate-limit secrets on a non-production environment.
3. Review `prisma/migrations/20261103120000_secure_multi_provider_auth/migration.sql`, then apply it with the normal reviewed migration process. It additively extends Session with recent-authentication, purpose and provider provenance, extends the existing native-attempt table, and creates authentication, encrypted-email-outbox, Apple authorization/event, and rate-limit tables plus indexes/foreign keys.
4. Deploy the web/server application. Verify existing Google login and an existing database session before enabling user-facing rollout.
5. Test new registration, verification, password reset, Apple web login, explicit linking, and unlink safeguards with isolated test users.
6. Build a new iOS binary because the AuthenticationServices bridge and Sign in with Apple entitlement are native changes. Verify Google external-browser handoff, Apple native login, session persistence, logout, Universal Links, and StoreKit in TestFlight/Sandbox.
7. Create the reviewer account manually through normal registration. Verify its mailbox and exercise normal features. Do not hardcode or seed credentials.
8. Only after separate approval, add that account's canonical User ID—not its email—to `APPLE_SANDBOX_ENTITLEMENT_USER_IDS`. Redeploy server configuration and verify an ordinary test user remains Free after a Sandbox purchase.

Rollback of the web code leaves the additive tables unused and preserves existing accounts. Do not roll back the migration by dropping populated auth tables after users begin using Apple/password authentication; restore application compatibility or perform an explicitly reviewed data-preserving migration instead.

Authentication email delivery is written transactionally to `AuthEmailDelivery` before the public response. Next.js `after()` immediately attempts the newly queued delivery and opportunistically drains a small additional batch, so a healthy registration or recovery request does not wait for a scheduler. `/api/cron/auth-email` is the independent retry and recovery path. Database leases using `FOR UPDATE SKIP LOCKED` prevent concurrent workers (including the request fast path) from claiming the same delivery. Expired or consumed action tokens and deleted accounts are marked terminal without being sent. Resend 4xx validation failures are terminal; transient, network, timeout, and provider-configuration errors use deterministic exponential retry beginning at 30 seconds, capped at one hour, and stop after 12 attempts. `AuthEmailDelivery` retains a safe failure category and terminal timestamp without storing provider response bodies or recipient data in error logs.

Delivery is at-least-once across a crash after Resend accepts a request but before PostgreSQL records success. The same Resend idempotency key is derived from the action token on every attempt to suppress duplicates; exactly-once delivery cannot be guaranteed across the database/provider boundary. Action links are still single-use and time-limited.

The checked-in `vercel.json` retains only the daily account-deletion cron. That schedule is compatible with Vercel Hobby. The authentication-email worker is intentionally absent because Hobby permits cron invocations only once per day, which cannot safely backstop one-hour password-reset tokens. Both worker routes return 503 without processing unless their respective enable flag is exactly `true`.

### Hobby authentication-email scheduler

Use one manually configured Upstash QStash schedule as the Hobby-compatible retry trigger. QStash's free allowance currently covers a five-minute schedule, and one scheduler retry keeps the theoretical maximum below that allowance. This is external infrastructure: repository deployment does not create or enable it.

1. Generate a dedicated random `AUTH_EMAIL_WORKER_SECRET` of at least 32 characters. Store it as a server-only Vercel environment variable and set `AUTH_EMAIL_WORKER_ENABLED=true` only after the migration, Resend configuration, and endpoint test pass. Do not reuse `CRON_SECRET` or `ACCOUNT_DELETION_WORKER_SECRET`.
2. In QStash, create a schedule targeting the stable production URL `https://calistheni.app/api/cron/auth-email` with cron `*/5 * * * *`, method `GET`, timeout `60s`, and one scheduler retry. Forward `Authorization: Bearer <AUTH_EMAIL_WORKER_SECRET>` to the destination. With the QStash REST API, the destination header is named `Upstash-Forward-Authorization`.
3. Test one manual invocation and confirm a 200 response containing aggregate queue status. A 401 means the forwarded secret is absent or wrong; 503 means the worker remains disabled; 500 means the worker invocation failed. Never place the secret in the destination URL, repository, logs, or response body.
4. Monitor QStash delivery history/DLQ, Vercel function logs, and `/admin/auth-email`. The free QStash tier has no uptime SLA and limited log/DLQ retention, so request-time `after()` remains the prompt-delivery path and the durable database outbox remains the source of truth.

QStash may retry a failed HTTP invocation once, while the application independently retries individual email rows. Repeated scheduler calls are safe: row claims use expiring leases and `FOR UPDATE SKIP LOCKED`, and every provider request uses a stable Resend idempotency key derived from the action token. Delivery is still at-least-once across a provider-success/database-write crash, so exactly-once delivery cannot be guaranteed.

Vercel sends its server-only `CRON_SECRET` as a bearer authorization header to the retained account-deletion cron. Keep `CRON_SECRET` equal only to `ACCOUNT_DELETION_WORKER_SECRET` for that route. The authentication-email endpoint separately accepts its dedicated `AUTH_EMAIL_WORKER_SECRET`. Both endpoints reject absent, short, or nonmatching credentials. For operational checks, a successful email-worker response contains aggregate pending/retrying/permanently-failed counts and the age of the oldest queued item; it does not return recipient addresses, tokens, or provider details. Investigate terminal failures through restricted server/database operations and correct provider configuration before manually requeueing only eligible actions. Never reset a consumed, expired, or deleted-account action token.

Administrators can view the aggregate queue health at `/admin/auth-email`. The page is protected by the existing admin session and shows pending/retrying/terminal counts, lease health, oldest-item age, and healthy/warning/critical status without exposing recipient or token values. The cron function also writes aggregate warning logs when status is unhealthy. This is operational visibility, not proactive notification: configure a Vercel runtime-log alert or another approved operator alert path before relying on unattended production delivery. The local repository cannot establish that alerting is configured in the Vercel project.

## Review account procedure

1. Ensure the intended mailbox (for example, `reviewer@calistheni.app`) exists and can receive mail.
2. Register through `/login?intent=signup` with a unique strong password stored in the organization's password manager.
3. Open the verification link and sign in normally.
4. Populate only representative, non-sensitive data through ordinary product flows. No production seed runs automatically.
5. Retrieve the canonical User ID with a reviewed, read-only administrative query.
6. Leave the Sandbox entitlement allowlist empty unless separately approved. When approved, configure only that exact User ID and test StoreKit normally; transaction signature, product, ownership, app-account token, expiration, revocation, and state checks remain mandatory.

The reviewer account receives no billing bypass. Stripe and Production Apple grants remain independent, and Sandbox grants retain an explicit `SANDBOX` marker.
