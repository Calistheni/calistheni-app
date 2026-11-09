# Account deletion and retention policy

Status: **product policy approved**. This document records approved product
decisions and the Phase 1 database foundation. It is not a statement that the
workflow has already been implemented or enabled.

## Approved product policy

When a user confirms account deletion, the account is to be deactivated
immediately, active sessions revoked, and the account removed from public
visibility. Personal information is to be deleted or irreversibly anonymized
within 30 days. A minimal anonymized `User` row may remain for relational
integrity. Confirmed deletion is permanent: the old account and its personal
data cannot be recovered. A future registration creates a genuinely new
account and does not inherit old data, provider identities, Stripe customer
identity, or purchase entitlements automatically.

Soft deletion is an initial deactivation mechanism, not completion of deletion.
The durable cleanup workflow must progress to completion and must not leave
ordinary personal account data indefinitely.

## Subscriptions and required user warning

Deleting an account does not cancel Stripe or Apple App Store subscriptions,
change billing schedules, or trigger refunds. Deletion must remain available
even when a subscription is active.

The deletion flow must display this warning prominently:

> Deleting your Calistheni account does not automatically cancel your
> subscriptions.
>
> If you subscribed through our website, we recommend cancelling your
> subscription in your Calistheni billing settings before deleting your
> account.
>
> If you subscribed through the Apple App Store, you can cancel your
> subscription through your Apple subscription settings before or after
> deleting your account.
>
> You may continue to be charged until your subscription is cancelled.

While the account is active, the existing Stripe billing portal and supported
Apple subscription-management action should be offered. Apple subscription
management must fall back to Apple's official subscription-management page
where a native StoreKit action is unavailable. Former website subscribers
must have a public support route to request cancellation; support must verify
ownership before changing a billing arrangement. The app must not automatically
cancel, pause, modify, refund, or delete billing agreements or provider
customers.

Stripe webhooks and Apple App Store server notifications may continue to update
necessary billing records after deletion. They must not reactivate or recreate
the account, restore personal data, or grant application entitlements to a
deleted account. Preserve restricted Apple `appAccountToken` mapping as needed
for notification reconciliation. Sign in with Apple authorization revocation
is distinct from App Store subscription cancellation and must not modify
StoreKit billing.

## Personal data and community contributions

Within 30 days, delete or irreversibly anonymize personal profile information,
credentials, authentication sessions and tokens, workouts and sets, personal
records, nutrition history, body measurements, private routines, social
relationships, posts, comments, personal rewards, personal media, and other
private user-owned records identified in the schema.

Approved public parks should remain available where their useful public
information can be preserved. Remove user attribution, profile links, personal
submission metadata, and identifying media. If a contribution cannot be
reliably anonymized, remove it from public visibility and create a durable
administrative review task with a deadline within the deletion window.

Preserve shared custom exercises referenced by other users when safe, while
removing creator attribution and identifying content. Delete unused private
exercises when referential integrity permits. Do not break other users'
workout history. Contributions that cannot be reliably anonymized must be
restricted from public view and queued for review.

## Restricted financial retention

Only the minimum records needed for legitimate subscription management,
payment reconciliation, accounting, tax obligations, disputes, or justified
fraud prevention may remain. Candidate technical references include Stripe
customer, subscription, checkout, payment and invoice identifiers; Apple
original transaction and transaction identifiers; `appAccountToken` mappings;
product, amount, currency, status and relevant transaction lifecycle dates;
and billing event identifiers. Retained information must be isolated from
public profiles and ordinary user-facing APIs, and must not restore access,
personal information, or entitlements to a deleted account.

Phase 1 adds references to existing billing rows rather than copying their
financial payloads. The schema does not itself enforce authorization to these
records; application access controls and operational controls are required in
later phases. Never retain unrelated profile information alongside a financial
reference. If a financial field's retention necessity is uncertain, isolate it
from ordinary application use pending review rather than purging it blindly or
retaining all account data indefinitely.

### Legal verification still required

The approved product policy does not set statutory retention periods. Legal
and accounting advisers must confirm the applicable lawful basis, exact
retention duration, and access controls for each retained category in the
jurisdictions served. No Bulgarian, EU, tax, or accounting retention duration
is asserted here. This open legal verification does not authorize indefinite
retention of ordinary personal account data.

## Deletion lifecycle and operational requirements

Phase 1 introduces a durable deletion record with states `REQUESTED`,
`DEACTIVATED`, `CLEANUP_PENDING`, `CLEANUP_PROCESSING`, `CLEANUP_RETRY`, and
`CLEANUP_COMPLETED`, along with request/deactivation/deadline/attempt/completion
timestamps, retry metadata, safe error categories, and a processing lease.
It also introduces restricted references to existing financial records,
deleted Apple account-token mappings, durable community review tasks, and
Apple authorization revocation retry state.

Phase 2 implements authenticated, recent-session deactivation and session
revocation. Phase 3 adds a database-leased cleanup worker invoked by a daily
Vercel Cron request to `/api/cron/account-deletion`. Each invocation processes
a bounded number of accounts and media tasks. The default account batch is 5;
`ACCOUNT_DELETION_BATCH_LIMIT` can tune it from 1 to 20 after staging load tests.
Do not set it above the capacity tested against the deployment's 60-second
route limit. The worker authenticates with
`ACCOUNT_DELETION_WORKER_SECRET` (at least 32 characters), records retry state,
and reclaims expired leases after crashes. It does not rely on in-memory
timers. Configure the secret in the server environment before enabling the
cron in a deployment. The checked-in `vercel.json` declares the schedule; no
production schedule or project setting has been activated from this local
change.

For Vercel Cron authorization, configure Vercel's `CRON_SECRET` to the same
random value as `ACCOUNT_DELETION_WORKER_SECRET`, because the cron request
uses that value in its bearer authorization header. Keep both values server
only. The schedule is daily at 03:00 UTC. Production deployment must include
the migration before code that queries the new deletion tables and must set
the worker secret before the cron is allowed to process accounts.

Workout, nutrition, measurement, social, reward, profile, and authentication
records are removed in bounded batches. A minimal anonymized `User` tombstone
and the `AccountDeletion` workflow row are retained. Stripe and Apple
subscription records are not modified or cancelled; restricted references
and an opaque `appAccountToken` mapping preserve the routing needed by billing
operations. Apple notifications may update financial records but must never
reactivate the tombstone or grant it application access. Apple Sign-In token
revocation is retried independently and does not cancel StoreKit billing.

Approved user-submitted parks and foods are hidden while queued for review;
shared exercises are anonymized in place to preserve other users' references.
Contributions with unresolved review tasks prevent cleanup from being marked
complete. Personal media is removed from R2 only after checking for references
from other users. A failed object deletion remains retryable. Operators must
monitor retrying deletions and review tasks against their stored 30-day
deadlines. The current daily Vercel schedule is compatible with the hobby
cron cadence, but completion-time capacity must be verified in staging.
Administrators can inspect and resolve park/food contribution review tasks
through the admin-only `/api/admin/account-deletion/review-tasks` endpoints and
the `/admin/account-deletions` console. The console reports pending and retrying
deletions, failed operations, seven-day approaching deadlines, overdue work,
active cleanups, oldest pending deletion age, failed media cleanup, Apple
revocation pending/retry counts, and outstanding review tasks. Review endpoints
and the console require the existing administrator session. These are operator
dashboard and cron-log signals; no proactive notification destination is
configured in source.
Each task must be explicitly kept after anonymization or removed from public
visibility; the cleanup worker never resolves uncertain community content by
guessing. Phase 4 adds the user-facing settings flow without changing deletion
policy or backend authorization requirements.

Deletion records and error categories must not contain passwords, tokens,
emails, profile data, or raw provider payloads. Lease identifiers are
operational coordination values, not authentication secrets. Retained Apple
authorization material remains encrypted and restricted; revocation failure
must leave a retryable state without delaying immediate account deactivation.

## Scope and status

Phase 1 schema migration and Phase 2 deactivation remain local and have not
been applied to production. Phase 3 worker and cron implementation are local
only; no production account has been processed. The user-facing deletion flow
is local and uncommitted; full staging verification remains. Legal/accounting advisers
must still confirm statutory retention durations for the narrowly retained
financial categories; no specific period is assumed.

### Capacity and alerting verification required before rollout

The checked-in schedule invokes the deletion worker once daily at 03:00 UTC.
The default invocation claims at most five accounts; the configured limit is
clamped to 1–20. This gives a theoretical ceiling of 150 newly claimed accounts
per 30 days at the default, or 600 at the maximum, only if each claimed account
completes in one invocation. These are arithmetic upper bounds, not measured
throughput. Each invocation handles at most 20 media tasks and up to eight
cleanup passes, each using model batches of 50. Larger accounts, R2 retries,
Apple revocation retries, worker timeouts, and manual community reviews can
require later invocations and reduce throughput. Outstanding manual review
tasks intentionally prevent completion and can exceed 30 days without prompt
operator action.

No representative PostgreSQL benchmark or 30-day service-level guarantee has
been established in this repository. Before deployment, run synthetic small,
medium, and large account fixtures against a disposable/staging database, record
durations and rows removed per invocation, and choose a schedule/batch limit
that fits the deployed function and database budgets. Do not raise a production
schedule or batch limit based on these theoretical ceilings.

The admin console and cron logs expose retry, failure, deadline, and review
counts, but source code does not configure proactive notifications. An operator
must configure and test approved runtime-log alerting before unattended rollout.
A dashboard alone does not ensure the 30-day deadline is met.

`ACCOUNT_DELETION_REQUESTS_ENABLED` and `ACCOUNT_DELETION_WORKER_ENABLED` must
both be exactly `true` before the application accepts deletion requests and the
scheduled endpoint processes accounts. Both default to disabled. This prevents
the API from deactivating users while cleanup is unavailable and keeps a newly
deployed cron from processing data before verification. Keep both unset until
migrations, staging, schedule registration, and operator monitoring are
verified. `ACCOUNT_DELETION_WORKER_SECRET` must be at least 32 characters and
match Vercel's server-only `CRON_SECRET` bearer value for scheduled calls.
