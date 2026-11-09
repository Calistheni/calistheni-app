# Isolated staging deployment runbook

This runbook prepares staging; it does not authorize a deployment. Staging must
use a separate Vercel project, database, credentials, provider applications,
storage, test billing catalog, and controlled mailboxes. A Preview deployment
connected to production Neon is not staging.

## Architecture and external setup

| Component | Required isolated setup | Owner action |
| --- | --- | --- |
| Vercel | New project with a staging-only domain and this verification/staging branch as its Production Branch | Create manually; do not alias `calistheni.app`, connect a deploy hook to production, or enable automatic promotion |
| PostgreSQL | Empty staging database with a staging-only role and network policy | Create manually, record its identity, back it up, run collision preflight, then apply all migrations |
| Google | Staging OAuth client with `https://<staging-host>/api/auth/callback/google` | Add the exact HTTPS origin and callback in Google Cloud |
| Apple Sign In | Approved Services ID/domain with `https://<staging-host>/api/auth/callback/apple` | Configure in Apple Developer; use only staging-controlled accounts |
| Resend | Verified staging sender/domain and controlled test inboxes | Create/configure manually; do not use production recipients |
| Stripe | Test-mode account/catalog, test webhook endpoint, and preferably a least-privilege restricted test key | Configure `https://<staging-host>/api/stripe/webhook`; never supply live keys or Prices |
| Apple StoreKit | Sandbox/TestFlight users and approved Calistheni product identifiers | Configure manually; keep ordinary Sandbox entitlements disabled unless a canonical staging user ID is explicitly approved |
| R2 | Separate staging buckets and credentials for exercise and park media | Create manually; never grant access to production buckets |
| Mapbox | Staging-scoped public token restricted to the staging origin | Create/restrict manually before build because `NEXT_PUBLIC_*` values are build-time values |
| QStash | One five-minute authentication-email retry schedule | Prepare only; do not create or activate until the worker passes manual staging verification |

Start from `.env.staging.example`. Replace every marker in the Vercel staging
project only. Never copy a production secret. `CALISTHENI_DEPLOYMENT_TARGET`
must be `staging`; the application then requires matching HTTPS `AUTH_URL` and
`NEXT_PUBLIC_SITE_URL` values and rejects the production origin.

Before deployment, confirm the production Vercel project either excludes the
staging branch or has no production database credentials in its Preview
environment. The staging project must have no production alias, promotion rule,
shared deploy hook, production Neon URL, live Stripe key, or production R2 key.

## Database and migration gate

1. Resolve the staging database hostname and database name independently from Vercel configuration.
2. Verify it is not any production Neon hostname, project, branch, role, or database.
3. Take a staging backup or snapshot.
4. Run `npm run auth:email-collision-preflight` read-only against staging.
5. Review the five Phase 6 migrations and run `npx prisma migrate deploy` against staging only.
6. Confirm all 69 migration rows completed and `npx prisma validate` still passes.
7. Do not roll migrations back by dropping populated tables. Roll application code back or forward-fix with an additive migration.

## Safe initial worker state

The initial deployment must contain:

```dotenv
AUTH_EMAIL_WORKER_ENABLED=false
ACCOUNT_DELETION_REQUESTS_ENABLED=false
ACCOUNT_DELETION_WORKER_ENABLED=false
```

The daily `/api/cron/account-deletion` declaration remains in `vercel.json` and
is compatible with Hobby. With the worker flag disabled it returns 503 without
processing. Do not add `/api/cron/auth-email` to `vercel.json`; a five-minute
Vercel cron is unsupported on Hobby. See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

Use a unique `AUTH_EMAIL_WORKER_SECRET`. It must not equal `CRON_SECRET` or
`ACCOUNT_DELETION_WORKER_SECRET`. Set `CRON_SECRET` and
`ACCOUNT_DELETION_WORKER_SECRET` to the same staging-only value so Vercel's
daily bearer header authorizes only the deletion route.

After the application, migrations, monitoring, and provider configuration pass:

1. Enable `AUTH_EMAIL_WORKER_ENABLED` only, redeploy staging, and manually invoke the email endpoint with its bearer header. A safe empty queue should return 200 with aggregate status.
2. Configure but do not activate the QStash schedule until separately approved.
3. Enable `ACCOUNT_DELETION_WORKER_ENABLED`, redeploy, and manually verify an empty/controlled worker run.
4. Enable `ACCOUNT_DELETION_REQUESTS_ENABLED` last, only after deletion E2E testing is ready.

An emergency stop sets the relevant worker flag to `false`. Also pause/delete
the external QStash schedule to stop repeated 503 deliveries. Disabling account
deletion requests prevents new deletion workflows while leaving existing
durable records available for a reviewed recovery plan.

## Inactive QStash specification

Do not create this schedule during preparation. After approval, configure one
QStash schedule with:

| Field | Value |
| --- | --- |
| Destination | `https://<staging-host>/api/cron/auth-email` |
| Method | `GET` |
| Cron | `*/5 * * * *` |
| Timeout | 60 seconds |
| Scheduler retries | One |
| Forwarded header | `Authorization: Bearer <AUTH_EMAIL_WORKER_SECRET>` |

With the QStash REST API, forward the header as
`Upstash-Forward-Authorization`. Never put a secret in the URL, query string,
repository, response, or monitoring label.

The [QStash Free plan](https://upstash.com/pricing/qstash) currently allows
1,000 messages per day. Five-minute delivery is
288 messages per day, or at most 576 when every invocation uses one scheduler
retry. Free has no uptime SLA and only limited log/DLQ retention. Request-time
`after()` remains the prompt path; the encrypted database outbox is the source
of truth. QStash invocation retries and row-level retries are separate.

Monitor QStash delivery history and DLQ, Vercel function logs, and
`/admin/auth-email`. Alert on sustained pending age, permanent failures, expired
leases, HTTP 401/500, and repeated 503. Database leases with `FOR UPDATE SKIP
LOCKED`, bounded claims, retry backoff, single-use action tokens, and stable
Resend idempotency keys remain unchanged.

## End-to-end staging test checklist

Use synthetic accounts, unique provider identities, Stripe test objects, Apple
Sandbox/TestFlight transactions, and non-sensitive workout/nutrition data.
Never delete or modify a real account.

- [ ] Register by email/password and receive only the controlled staging email.
- [ ] Verify the email link uses the staging origin, is single-use, and expires safely.
- [ ] Request a password reset; verify enumeration resistance, single use, expiry, and the staging origin.
- [ ] Log in with the staging Google client; verify no implicit email-based account merge.
- [ ] Log in with Apple web and native flows using a staging/Sandbox identity.
- [ ] Link Google and Apple only after recent authentication; reject collisions.
- [ ] Prevent unlinking the final login method; verify successful unlink revokes only the intended provider sessions.
- [ ] Create and reopen a synthetic workout, including media only in staging R2.
- [ ] Create nutrition history and confirm it remains private to the staging user.
- [ ] Create personal records and confirm ownership enforcement.
- [ ] Request account deletion only after the request flag is deliberately enabled.
- [ ] Confirm web sessions, native sessions, action tokens, and provider links are revoked at deactivation.
- [ ] Immediately re-register the same email and the same Google/Apple identities.
- [ ] Record a read-only comparison proving the new canonical user ID differs from the tombstone ID.
- [ ] Confirm no workout, nutrition, personal record, profile, session, token, media, or preference transfers.
- [ ] Run old-account cleanup and confirm it cannot delete replacement-account data.
- [ ] Confirm shared park objects/media survive while still referenced by another active record.
- [ ] Purchase/cancel monthly and yearly subscriptions and buy lifetime access using Stripe test mode only; verify signed webhooks and Customer Portal behavior.
- [ ] Exercise Apple Sandbox monthly/yearly/lifetime purchase, restore, expiry, refund/revocation, and account switching without live charges.
- [ ] Confirm old Stripe customers/subscriptions and Apple transaction chains never grant the replacement account.
- [ ] Force a retryable email failure, verify backoff/lease recovery, then verify one controlled delivery after recovery.
- [ ] Exercise the deletion worker with a synthetic account, including Apple-revocation retry and bounded concurrency.
- [ ] Verify admin aggregate monitoring contains no recipient, token, provider body, or secret values.
- [ ] Test mobile Google browser handoff, native Apple login, session persistence, logout, account switching, Universal Links, and StoreKit redelivery without uploading a build.

## Deployment safety checklist

- [ ] Review all files in `origin/main...verification/account-lifecycle-phase-6g`, including migrations, native files, CI, and dependency changes.
- [ ] Resolve or explicitly exclude every unstaged working-tree change; do not stage by accident.
- [ ] Confirm the target Vercel project ID and domain are staging-only.
- [ ] Confirm the target database identity is staging-only and absent from production configuration.
- [ ] Compare every staging environment variable against the template and reject unresolved markers.
- [ ] Verify `CALISTHENI_DEPLOYMENT_TARGET=staging` and matching HTTPS site/auth URLs.
- [ ] Verify Google and Apple callback URLs exactly match the staging origin.
- [ ] Verify the email and deletion worker secrets are distinct as documented.
- [ ] Verify all three feature flags are `false` for the initial deployment.
- [ ] Verify `STRIPE_MODE=test`, test Prices, a test webhook secret, and no live key.
- [ ] Verify Apple testing uses Sandbox/TestFlight and the Sandbox entitlement allowlist is empty initially.
- [ ] Verify R2 credentials cannot access production buckets and the Mapbox token is staging-origin restricted.
- [ ] Verify no production Neon, Resend, Stripe, Apple private key, R2, OAuth, or worker credential is present.
- [ ] Confirm GitHub Actions production-build verification is green for the exact commit.
- [ ] Confirm the staging project cannot alias/promote to `calistheni.app` and merging to `main` remains a separate manual approval.
- [ ] Keep a staging database backup and forward-recovery plan; never drop populated additive auth tables during rollback.

Staging is not considered working until deployment completes and this checklist
is executed with recorded results.
