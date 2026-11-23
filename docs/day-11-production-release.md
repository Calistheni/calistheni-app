# Day 11 production release runbook

This is the release sequence for a future, separately approved production window. Do not execute a live step during local preparation. The [authentication deployment notes](authentication-deployment.md), [staging runbook](staging-deployment.md), and [Day 8 security notes](day-8-security-rollout.md) provide subsystem details.

**Merge and deployment gate: NO-GO.** Vercel tracks `main` and automatically deploys changes. Treat a merge or push to `main` as a production release action. Keep `main` unchanged until Phases A and B pass, the media cutover and recovery plan are ready, and the release owner authorizes Phase C. Where controlled promotion is available, verify that the new build cannot receive public traffic before promotion. Keep the same pre-merge gates.

## Phase A — Pre-release

Record each gate as passed, failed, or unknown, with an owner and an evidence link. An unresolved required gate blocks the release.

### Controlled replacement checklist

1. Pin the reviewed application revision and migration payload separately. Verify the schema and migration files match the approved payload byte for byte.
2. Require `Production build verification` / `Validate and build` and `Actions diagnostic` on the exact verification-branch SHA. If the deployment uses a different SHA, verify the reviewed tree and equivalent CI for that SHA.
3. Establish maintenance across production aliases and direct deployment URLs. Drain writes and pause workers and webhooks that can write to the database. Confirm a fresh restorable recovery point and a verified rollback or forward-fix path.
4. Obtain separate approval to execute the guarded migrations, then complete the schema and email-collision postflight. A merge to `main` can trigger a deployment and requires separate approval.
5. Verify the exact hardened deployment under maintenance before reopening traffic or resuming jobs. An earlier deployment with an unknown database binding remains ineligible for rollback unless its binding and compatibility are independently verified.

### Attest the hardened application before reopening traffic

1. Prepare an approved, protected, unaliased Production candidate from the pinned application revision. Verify platform authentication before testing. Record the candidate's exact origin, deployment ID, and revision privately. Keep aliases, writes, and workers under maintenance.
2. Follow the private operator checklist for injecting the digest and expiry of a fresh, short-lived bearer into the candidate only. Use the application's existing database configuration and Prisma pool. Store credentials and candidate-specific settings through the approved secret mechanism.
3. Confirm that a signed-out request encounters platform authentication. From the verified origin in the authenticated operator session, run the read-only runtime attestation using the short-lived bearer over HTTPS. Do not send the bearer through a redirect or record it in logs. Require a successful non-cacheable response tied to the approved deployment. An identity mismatch or failed TLS verification stops the release.
4. Match the returned pooler hostname, database, login and effective roles, and schema against the approved private inventory. Require TLS certificate and hostname verification. Independently map the observed endpoint to the intended Neon branch. The check verifies TLS from the application to the pooler and cannot observe onward transport or attest an earlier deployment.
5. Complete smoke checks under maintenance. Promote only the attested deployment after approval and verify the alias points to its exact deployment ID. Re-attest if a new deployment is created. Verify the check rejects the expired bearer, discard it, and remove temporary operator configuration with approval. Reopen traffic and resume workers only after separate approval. Any separate diagnostic cleanup also requires separate approval.

### Release revision and window

- Record the approved release SHA, deployment provenance, required CI, and verified rollback or forward-fix plan in the private release record. Recheck them immediately before release.
- Agree on the maintenance window, maximum lock wait, smoke-test window, and stop authority. Enforce a write freeze or equivalent consistency control covering account-email changes, workout media writes and deletes, and overlapping background jobs. Cover direct deployment URLs or aliases that can still run the old write paths. Check in-flight requests and worker leases before taking final counts. If there is an outage risk from DDL locks, include reads in the maintenance plan.
- Verify effective production-only credentials and service destinations without recording values. Check Apple and Google OAuth and callbacks, email sender/provider and retry scheduler, deletion worker and cron, Stripe live account/catalog/webhook, StoreKit products and notifications, workout-photo access and public park media, and production Mapbox and nutrition provider settings. Keep isolated validation and recovery environments free of live mail, paid billing, webhook, and production write credentials. Confirm the daily Vercel deletion cron and the separately managed auth-email retry scheduler.

### Attest both database connections

Use the approved private inventory to confirm the exact Neon project, branch, and endpoint mapping. Record the database and approved roles privately. Keep the runtime's pooled connection separate from the migration runner's direct, TLS-verified connection.

1. **Application runtime.** Follow [the hardened application attestation procedure](#attest-the-hardened-application-before-reopening-traffic) on the exact protected candidate. Project-level settings alone cannot prove the binding of an earlier deployment.
2. **Migration runner.** Use an explicitly authorized direct connection in an isolated process. Verify the hostname, database, login and effective roles, branch, certificate, and hostname validation. Keep the connection string out of logs and version control. Use a separate read-only connection for independent inspection.
3. **Guarded verification.** Use the [guarded runner](../scripts/production-migrate.mts) in read-only verification mode against the pinned payload. Record only the status and aggregate evidence. A direct runner verification does not attest an application's pooled connection.

### Reconcile production migration history

In the attested database, use the following read-only query to compare migration metadata with the pinned migration files. Keep all attempt records in the private release record. The historical Park migration divergence is handled only by the narrowly scoped, explicitly approved exception implemented in the guarded runner. The original applied SQL remains unrecovered. The runner pins the approved checksums and rechecks the catalog without modifying migration history. Any other mismatch blocks release. Evaluate staging independently and require recovery rehearsal before execution.

```sql
BEGIN READ ONLY;

SELECT migration_name,
       checksum,
       CASE
         WHEN rolled_back_at IS NOT NULL THEN 'rolled back'
         WHEN finished_at IS NOT NULL THEN 'applied'
         ELSE 'unfinished'
       END AS status,
       started_at,
       finished_at,
       rolled_back_at,
       applied_steps_count
FROM public."_prisma_migrations"
ORDER BY started_at, migration_name;

ROLLBACK;
```

1. Inventory `prisma/migrations/*/migration.sql` at the pinned release SHA, preserving exact names and bytes. For each file, compute its SHA-256 from the Git blob, for example `git show "${RELEASE_SHA}:prisma/migrations/${MIGRATION_NAME}/migration.sql" | shasum -a 256` after confirming the path exists. Compare with Prisma's recorded checksum. Investigate any discrepancy using the original applied artifact and Prisma's checksum behavior.
2. Group rows by exact migration name. Record all attempt statuses and timestamps. Require each successful attempt to match the release SQL, with the single owner-approved and re-attested discrepancy described above. Investigate duplicate successes, unfinished or failed attempts, rolled-back attempts, unknown names, missing files or history, and any other checksum mismatch. Retain the attempt history even after the cause is understood.
3. Derive the ordered pending set from release files lacking a successful matching attempt after reconciliation. It must equal the seven files in Phase B. Verify the expected pre-migration schema objects and inspect relation sizes, long-running transactions, and lock pressure. Ordinary indexes on `User`, `Park`, `Workout`, and `WorkoutComment` can block writes. Rehearse with representative volume in the isolated recovery environment.
4. Stop on unexplained drift or history. Do not edit applied SQL, modify the history table, or use `prisma migrate resolve` as part of this procedure. `prisma migrate deploy` applies all pending files and does not reconcile drift. See [Prisma deploy behavior](https://docs.prisma.io/docs/cli/migrate/deploy).

### Prove recovery

**Owner action.** Confirm the production Neon plan, configured retention window, and oldest available restore point. Check that a point-in-time restore is available for the intended production branch. Agree on and record the maximum acceptable data loss and recovery time. See [Neon instant restore](https://neon.com/docs/postgres/backup-restore/branch-restore).

Keep rehearsal evidence, retention, and recovery timings in the private release record. Verify the final recovery point under the release freeze.

- Under separate approval, rehearse restore into an isolated, access-restricted branch with a separate endpoint and credentials. No production aliases, workers, or webhooks should point at the rehearsal branch. Verify restored migration attempts and checksums, required schema objects, and aggregate counts for users, workouts, workout photos, and relevant queues. Compare with the chosen recovery point without exporting personal records. Measure the time to establish a healthy recovered service, including validation and routing.
- Under the release freeze, capture the final approved recovery timestamp or LSN just before the migration. Confirm it can be selected for restore and remains within retention for the rollback window. Record the verified media reference snapshot and any copy manifest at the same cutover boundary. PostgreSQL restore does not restore R2.
- Record when to preserve the migrated schema and forward-fix, when a compatible app rollback is safe, and who can authorize a database restore. Account for writes and external billing, email, deletion, or moderation effects after the recovery point before restoring.

### Verify workout and park photo delivery

Public workout photos are served through the application's authorization endpoint. Keep direct workout-object access blocked. Approved park photos and exercise assets keep their public URLs.

1. Verify the approved edge policy denies raw workout paths, including cached requests and encoded or normalized variants. Audit alternate public access paths such as custom domains, development URLs, and proxies. Keep approved park assets, authenticated park previews, and signed S3 access working. Store the exact policy, representative URLs, and cache evidence in the private operator record.
2. Reconcile the workout-photo references under the release freeze. Check key ownership and use signed object metadata requests to verify the bucket, object existence, type, and byte size. Keep object keys in the private inventory and record only aggregate results. Reuse existing objects only when all references, access controls, and cleanup behavior are verified.
3. Purge legacy photo entries and applicable cache variants during the approved release window. Require application photo responses to use `private, no-store`. Keep the direct-path block in place during cutover and rollback. If the shared delivery controls cannot be verified, stop the release until a separately approved storage plan passes.

## Phase B — Database preparation

Start only after Phase A is signed off and the approved production window and consistency controls are active.

1. Run `npm run --silent auth:email-collision-preflight -- --pre-migration` with an approved read-only connection and independently verified hostname. Stop on any nonzero exit. Resolve collisions through an approved procedure, then rerun. The CLI rejects `channel_binding=require` before connecting. If required by policy, use a separately reviewed preflight client that enforces it. Review expected schema objects, relation sizes, and aggregate lock and transaction pressure without capturing SQL text or user records. Agree on the stop threshold before DDL.
2. Reconfirm the exact ordered pending set just before DDL. The execution runner repeats its live target, history, and exception checks before applying anything:

   1. `20261103120000_secure_multi_provider_auth`
   2. `20261103130000_account_deletion_foundation`
   3. `20261109120000_account_deletion_park_photo_lookup`
   4. `20261109123000_account_deletion_food_review_checkpoint`
   5. `20261109130000_auth_email_outbox_leases`
   6. `20261117210000_ugc_moderation`
   7. `20261119120000_harden_native_google_handoff`

3. Verify the final recovery point and obtain separate execution approval. In the approved window, use exactly one guarded runner. It re-attests the connection and migration history immediately before invoking Prisma. Stop if the runner guard fails, the pending set differs, or any migration fails or exceeds the agreed lock window. Inspect actual schema and attempt history before any recovery or retry.

   Use the separately approved invocation in the private operator checklist. Keep the production target and authorization parameters out of shared logs.

4. Repeat reconciliation by name, checksum and status. Confirm the seven expected migrations completed and no unexpected pending or incomplete attempts remain. Record the approved historical discrepancy separately and verify the production digest remains unchanged. Verify the expected live tables, columns, enums, indexes and constraints. Run the post-migration collision check with `--post-migration`. Both checks must pass before hardened traffic or workers start.

### Read-only catalog checks before DDL

The original authentication migration defines `Session.sessionToken` as the sole unique key through `Session_sessionToken_key`. The Prisma model uses `@unique` without `@id`, and the original SQL creates no primary key on `Session`. No pending migration requires `Session.id`. The first pending migration adds only `authenticatedAt`, `purpose`, and `authProvider` to `Session`, with `purpose` defaulting to `APPLICATION` for existing sessions. `NativeSession` is a separate table.

Run the catalog checks on the attested database to verify prerequisite columns, expected keys, and absence of objects introduced by the pending migrations. Record aggregate status and inspect lock and idle transaction pressure under the freeze.

```sql
BEGIN READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- Expect zero rows. Report only missing or incompatible prerequisite columns.
WITH required(relation, column_name, expected_type, required_not_null) AS (
  VALUES ('User', 'id', 'text', true), ('User', 'email', 'text', false),
         ('Session', 'sessionToken', 'text', true), ('Session', 'userId', 'text', true),
         ('Session', 'expires', 'timestamp(3) without time zone', true),
         ('NativeAuthAttempt', 'id', 'text', true), ('Park', 'photoKey', 'text', false),
         ('Workout', 'id', 'integer', true), ('WorkoutComment', 'id', 'text', true)
)
SELECT r.relation, r.column_name, r.expected_type,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS actual_type
FROM required r
LEFT JOIN pg_catalog.pg_attribute a
  ON a.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', r.relation))
  AND a.attname = r.column_name AND a.attnum > 0 AND NOT a.attisdropped
WHERE a.attnum IS NULL
   OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> r.expected_type
   OR (r.required_not_null AND NOT a.attnotnull);

-- Expect the two unique-key checks and cascade-FK check to be true.
-- Expect has_session_primary_key to be false, matching the repository baseline.
WITH cols AS (
  SELECT
    (SELECT attnum FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public."Session"'::regclass AND attname = 'sessionToken') AS token_attnum,
    (SELECT attnum FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public."Session"'::regclass AND attname = 'userId') AS session_user_attnum,
    (SELECT attnum FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public."User"'::regclass AND attname = 'id') AS user_attnum
), unique_keys AS (
  SELECT i.*
  FROM pg_catalog.pg_index i
  WHERE i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
    AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
)
SELECT
  EXISTS (SELECT 1 FROM unique_keys i WHERE i.indrelid = 'public."Session"'::regclass
          AND i.indkey[0] = cols.token_attnum) AS session_token_is_unique,
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid = 'public."Session"'::regclass
          AND i.indisprimary) AS has_session_primary_key,
  EXISTS (SELECT 1 FROM unique_keys i WHERE i.indrelid = 'public."User"'::regclass
          AND i.indkey[0] = cols.user_attnum AND i.indimmediate) AS user_id_is_unique,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint f
    WHERE f.conrelid = 'public."Session"'::regclass AND f.confrelid = 'public."User"'::regclass
      AND f.contype = 'f' AND f.convalidated
      AND f.conkey = ARRAY[cols.session_user_attnum] AND f.confkey = ARRAY[cols.user_attnum]
      AND f.confdeltype = 'c' AND f.confupdtype = 'c'
  ) AS session_user_fk_cascades
FROM cols;

-- Expect zero rows for columns introduced by the pending migrations.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND (table_name, column_name) IN (
  ('Session', 'authenticatedAt'), ('Session', 'purpose'), ('Session', 'authProvider'),
  ('NativeAuthAttempt', 'intent'), ('NativeAuthAttempt', 'browserStartedAt'),
  ('NativeAuthAttempt', 'verifierChallenge'), ('NativeAuthAttempt', 'initiatingSessionHash'),
  ('User', 'deletedAt'), ('User', 'communityRestrictedAt'),
  ('User', 'communityRestrictionReason'),
  ('Workout', 'moderationHiddenAt'), ('Workout', 'moderationReason'),
  ('WorkoutComment', 'moderationHiddenAt'), ('WorkoutComment', 'moderationReason')
)
ORDER BY table_name, column_name;

-- Expect zero rows. The names come from the seven pinned migration files.
WITH pending(name) AS (
  SELECT unnest(ARRAY[
    'AccountDeletion', 'AccountDeletionStatus', 'AccountDeletion_apple_revocation_idx',
    'AccountDeletion_pkey', 'AccountDeletion_processingLeaseExpiresAt_idx',
    'AccountDeletion_status_cleanupDeadline_idx', 'AccountDeletion_userId_key',
    'AppleAccountEvent', 'AppleAccountEvent_jti_key', 'AppleAccountEvent_pkey',
    'AppleAccountEvent_providerAccountId_eventTime_idx', 'AppleAccountEvent_receivedAt_idx',
    'AppleAuthAttempt', 'AppleAuthAttempt_expiresAt_idx', 'AppleAuthAttempt_pkey',
    'AppleAuthAttempt_stateHash_key', 'AppleAuthAttempt_userId_intent_createdAt_idx',
    'AppleAuthorization', 'AppleAuthorization_pkey', 'AppleAuthorization_providerAccountId_key',
    'AppleAuthorization_userId_key', 'AuthActionToken', 'AuthActionTokenPurpose',
    'AuthActionToken_expiresAt_idx', 'AuthActionToken_pkey', 'AuthActionToken_tokenHash_key',
    'AuthActionToken_userId_purpose_createdAt_idx', 'AuthEmailDelivery',
    'AuthEmailDelivery_actionTokenId_key', 'AuthEmailDelivery_deliveredAt_nextAttemptAt_idx',
    'AuthEmailDelivery_leaseExpiresAt_idx',
    'AuthEmailDelivery_permanentlyFailedAt_nextAttemptAt_idx', 'AuthEmailDelivery_pkey',
    'AuthLinkIntent', 'AuthLinkIntent_expiresAt_idx', 'AuthLinkIntent_nativeAuthAttemptId_key',
    'AuthLinkIntent_pkey', 'AuthLinkIntent_secretHash_key',
    'AuthLinkIntent_userId_provider_createdAt_idx', 'AuthRateLimit',
    'AuthRateLimit_action_blockedUntil_idx', 'AuthRateLimit_expiresAt_idx', 'AuthRateLimit_pkey',
    'DeletedAppleAccountMapping', 'DeletedAppleAccountMapping_accountDeletionId_idx',
    'DeletedAppleAccountMapping_appAccountToken_key', 'DeletedAppleAccountMapping_pkey',
    'DeletionAppleRevocationStatus', 'DeletionCommunityResourceKind',
    'DeletionCommunityReviewTask', 'DeletionCommunityReviewTask_leaseExpiresAt_idx',
    'DeletionCommunityReviewTask_pkey', 'DeletionCommunityReviewTask_resource_key',
    'DeletionCommunityReviewTask_status_cleanupDeadline_idx', 'DeletionFinancialProvider',
    'DeletionFinancialRecordKind', 'DeletionReviewStatus', 'ModerationAction',
    'ModerationActionType', 'ModerationAction_pkey', 'ModerationAction_reportId_createdAt_idx',
    'ModerationAction_targetType_targetId_createdAt_idx', 'ModerationReport',
    'ModerationReportReason', 'ModerationReportStatus', 'ModerationReportTarget',
    'ModerationReport_pkey', 'ModerationReport_reporter_target_key',
    'ModerationReport_status_createdAt_idx', 'ModerationReport_targetOwnerId_idx',
    'ModerationReport_targetType_targetId_idx', 'NativeAuthIntent', 'Park_photoKey_idx',
    'PasswordCredential', 'PasswordCredential_emailNormalized_key', 'PasswordCredential_pkey',
    'RestrictedFinancialReference', 'RestrictedFinancialReference_pkey',
    'RestrictedFinancialReference_retained_record_key',
    'RestrictedFinancialReference_source_idx', 'SessionPurpose', 'UserBlock',
    'UserBlock_blockedId_createdAt_idx', 'UserBlock_pkey', 'User_communityRestrictedAt_idx',
    'User_deletedAt_idx', 'WorkoutComment_moderationHiddenAt_idx',
    'Workout_moderationHiddenAt_idx'
  ])
)
SELECT p.name
FROM pending p
WHERE pg_catalog.to_regclass(pg_catalog.format('public.%I', p.name)) IS NOT NULL
   OR pg_catalog.to_regtype(pg_catalog.format('public.%I', p.name)) IS NOT NULL
ORDER BY p.name;

ROLLBACK;
```

Stop on a missing key, unexpected column or object, unexplained type or constraint difference, or incomplete catalog access. The migrations add the auth enums and tables before later migrations alter them. In particular, `NativeAuthIntent`, `AccountDeletion`, and `AuthEmailDelivery` must be absent before the batch, and the migration order in Phase B creates each before its later alteration. Reconfirm locks and transaction pressure at execution time under the write freeze. Separate migration execution approval and the remaining production release gates still apply.

## Phase C — Application release

1. **Confirm Phase B is complete before merging.** Reconfirm the guarded runner's pinned migration payload and compare it with the approved application revision. Confirm the approved migration and both postflight checks completed under the same freeze. Keep authentication email and account-deletion schedules controlled until the new versions pass smoke tests. Do not merge `main` while any database, recovery, or storage gate is unresolved.
2. **Merge and deploy only with separate release approval.** Reconfirm the exact approved revision and the media, database and postflight evidence. Keep the maintenance gate in place because `main` auto-deploys. Use a protected, unaliased Production candidate and attest it before promotion. Verify the actual deployed revision, database connection, Stripe mode, R2 settings, and smoke checks on that candidate. After separately approved promotion, confirm the alias points to the attested deployment ID and repeat application smoke checks from the alias while maintenance remains active. [Vercel production promotion](https://vercel.com/docs/deployments/promoting-a-deployment)

3. **Verify the hardened runtime before lifting maintenance.** Record trusted deployment-specific evidence that the application driver connects to the approved production pooler, database and role with verified TLS. Verify new photo responses are `private, no-store` and purge legacy Vercel and Cloudflare photo entries, including known variants. Keep the Cloudflare raw workout-path block active. Verify moderation, authentication and session behavior, account-deletion cleanup, and billing entitlements with approved test accounts before enabling workers and reopening traffic.

#### Photo smoke tests and stop conditions

Disposable PostgreSQL and mocked-R2 tests cover application authorization, owner upload and removal, key validation, account-deletion cleanup, and park URL generation. Live WAF execution, cache behavior, production data and object presence, and rendering on the deployed revision require owner-approved checks. All writes below are limited to separately approved synthetic fixtures and controlled test accounts. Keep the general freeze in place during those tests.

| Check | Owner action and pass condition |
|---|---|
| Public app photo and existing links | From a clean signed-out browser, open a public synthetic workout and its `/api/workouts/[id]/photos/[photoId]` URL. Expect `200`, `image/webp`, and no redirect. Open the detail from workout history while signed in, then check the public profile and feed from an eligible account. Privately check the current visibility of the three inventoried rows. Verify rows eligible for public delivery still use their original app URLs and render where expected. |
| Private photo and cache isolation | First load the public app URL normally to exercise any cache. Set the synthetic workout to private. Reopen the exact same URL with normal request headers as signed-out, unrelated, and owner clients. Expect `404`, `404`, and `200`. Repeat without query busting. Require `Cache-Control: private, no-store` and no shared cache hit on success or denial. |
| Moderation and deletion | On a public synthetic workout, use the authorized moderation action to hide it, then open the same app URL as a signed-out visitor and the owner. Expect `404` for both. On a separate synthetic workout, delete the photo as owner, repeat the URL checks, and verify signed `HeadObject` confirms absence. Repeat for a workout removed with its photos. A storage permission error is inconclusive. |
| Raw R2 and aliases | Follow the edge verification in Phase A with GET and HEAD, including warm requests and encoded or normalized variants. The canonical raw path remains blocked before and after promotion for both public and private examples. The signed S3 path remains accessible to the app. |
| Park and exercise assets | Open approved park images and exercise assets from their existing public URLs in a clean client and in the app. Expect normal rendering and no change of host or path. Confirm the pending park admin preview still renders and the submission remains absent from public listings. |
| Upload and account deletion | Upload a synthetic photo as owner and confirm an unrelated account cannot upload to or delete a photo from that workout. For an approved deletion test account, request account deletion, confirm its photo URL is denied after deactivation, then verify the worker cleans up the correct R2 object and unrelated media still loads. Verify login/session, API and worker health, and pre-release native Google exchange compatibility before opening traffic. |

If any check fails, keep the freeze and the raw-path block. Use a verified forward fix or an approved rollback revision with independently verified database binding, schema compatibility, photo authorization, and `no-store`. A deployment with unknown database binding is ineligible without that evidence. Keep approved park and asset delivery live. If the edge rule affects a legitimate park URL, correct the scoped park exception under the maintenance gate and repeat all edge and cache checks before reopening. Never reopen raw workout access to recover images. If a separate destination is ultimately needed, keep legacy copies inaccessible and align their cleanup and recovery window with the database plan.

## Phase D — Post-release and recovery decisions

- With approved test accounts, verify Google and Apple sign-in, account-deletion reauthentication and cleanup, workout-photo visibility, park assets, Stripe and StoreKit entitlements and webhook handling, moderation and user-generated content, auth email delivery and retries, scheduled jobs, and public Support, Privacy, Terms, and Community Guidelines. Use sandbox billing where appropriate. Enable and observe the verified deletion worker before accepting deletion requests.
- Monitor errors, lock waits, queue age and retries, storage misses, and payment notifications. Record each gate, release SHA, deployment ID, migration attempts, recovery timestamp, and aggregate media results. Keep secrets and object keys out of the release record.
- On an identity mismatch, failed migration, unexpected checksum discrepancy, unexpected data change, media exposure, or failed smoke test, halt progression and keep writes or workers paused. Before hardened writes, a rollback revision needs verified database binding and compatibility with the additive schema and current media restrictions. After new auth, deletion, moderation or media writes, favor a compatible forward fix. Use a Neon restore only under separate incident approval with an explicit plan for writes and external side effects since recovery and for matching R2 objects. Never restore public access as a rollback shortcut.
