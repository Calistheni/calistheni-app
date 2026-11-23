# Day 11 production release runbook

This is the release sequence for a future, separately approved production window. Do not execute a live step during local preparation. The [authentication deployment notes](authentication-deployment.md), [staging runbook](staging-deployment.md), and [Day 8 security notes](day-8-security-rollout.md) provide subsystem details.

**Merge and deployment gate: NO-GO.** Vercel tracks `main` and automatically deploys changes. Treat a merge or push to `main` as a production release action. Keep `main` unchanged until Phases A and B pass, the media cutover and recovery plan are ready, and the release owner authorizes Phase C. Where controlled promotion is available, verify that the new build cannot receive public traffic before promotion. Keep the same pre-merge gates.

## Phase A — Pre-release

Record each gate as passed, failed, or unknown, with an owner and an evidence link. An unknown gate blocks the release.

### Release revision and window

- Pin the approved release SHA. The Day 11 checkpoint is `e4a8089fb6e7b5550f7755594036f2de8cf595b1`. The last confirmed production revision is `c4ce55d26a6a76d993bff4fdeedefbc6a0f84cc6`. Verify both again at release time.
- Confirm [Production build verification](https://github.com/Calistheni/calistheni-app/actions/runs/45032707228) and [Actions diagnostic](https://github.com/Calistheni/calistheni-app/actions/runs/45032707282) passed on the approved SHA. If the merge method produces a different deployment SHA, identify and approve that revision, confirm the intended tree and migration files, and obtain equivalent verification before traffic. Record the actual commit, deployment ID, and rollback candidate.
- Agree on the maintenance window, maximum lock wait, smoke-test window, and stop authority. Enforce a write freeze or equivalent consistency control covering account-email changes, workout media writes and deletes, and overlapping background jobs. Cover direct deployment URLs or aliases that can still run the old write paths. Check in-flight requests and worker leases before taking final counts. If there is an outage risk from DDL locks, include reads in the maintenance plan.
- Verify effective production-only credentials and service destinations without recording values. Check Apple and Google OAuth and callbacks, email sender/provider and retry scheduler, deletion worker and cron, Stripe live account/catalog/webhook, StoreKit products and notifications, private workout and public park media, and production Mapbox and nutrition provider settings. Keep isolated validation and recovery environments free of live mail, paid billing, webhook, and production write credentials. Confirm the daily Vercel deletion cron and the separately managed auth-email retry scheduler.

### Attest both database connections

**Owner action.** In Neon Console, select project `calistheni`, branch `production`, and confirm that compute `ep-dark-dew-aizz21ag` belongs to that branch. Record the exact direct and, if used, pooled hostnames from that compute, the database `neondb`, and the approved app and migration roles. Never record passwords, URLs containing credentials, or tokens. A hostname pattern or a database name alone does not establish the branch.

1. **Live Vercel runtime.** Identify the deployment currently serving the production domain. Using trusted evidence tied to that deployment and its effective connection, verify the exact hostname, driver-verified TLS with hostname checking, connected database, and login and effective roles. In an approved existing runtime attestation, use `current_database()`, `session_user`, and `current_user` for the latter checks. Map the observed endpoint independently to the owner-verified Neon branch. The current project variable list alone cannot establish what an older deployment uses. If no trusted deployment-specific evidence exists, leave this gate unknown and obtain separate approval for an attestation. Do not repurpose the staging diagnostic against production.
2. **Migration runner.** Use the direct, non-pooled hostname for that same endpoint. For example, the pooled runtime hostname has `-pooler` in the compute label. Use a TLS-capable driver with certificate and hostname validation and an approved migration role scoped to this database with the required DDL and migration-history privileges. Use a separate read-only connection for inspection. Attest the exact runner secret, database, login/effective roles, and branch immediately before migration. Reject Preview or staging origins, the pooled host, unexpected roles or database, and routing overrides. Use an isolated operator process with an explicitly injected connection and no inherited project dotenv or deployment configuration. See [Neon pooling guidance](https://neon.com/docs/connect/connection-pooling).
3. **Use the guarded runner.** The app's [Prisma initializer](../lib/prisma.ts) is separate from the [default Prisma CLI configuration](../prisma.config.ts), which can load local environment files. Keep production DDL credentials scoped to the approved operator process. In that process, inject the independently approved exact hostname and role as `PRODUCTION_MIGRATION_EXPECTED_HOST` and `PRODUCTION_MIGRATION_EXPECTED_ROLE`, and supply `PRODUCTION_MIGRATION_DATABASE_URL` through the secret mechanism. The URL must target the direct host, `neondb`, and the approved role with `sslmode=verify-full` and optional `schema=public`. If channel binding is mandatory, arrange a reviewed runner that can enforce it before proceeding. The [guarded runner](../scripts/production-migrate.mts) refuses ambient connection overrides, checks the live connection and exact history, and uses the migration files and schema from the pinned Git revision. Keep the operator checkout and installed dependencies trusted and ensure the pinned Git object exists locally. Use the guarded command for production DDL.

   Run the read-only verification only after connection access and the historical exception are separately approved:

   ```bash
   npm run --silent db:migrate:deploy -- --production --release b81e5349cf28ea97f4aa375a555c0d38174ffc00 --verify --owner-approved-location-index-exception
   ```

   The flag records the operator's acknowledgement of separate, documented owner approval. The runner checks the target, history, pending set, and current schema without calling Prisma Migrate. Without the flag, the normal exact-checksum policy applies.

### Reconcile production migration history

**Owner action.** In Neon SQL Editor, choose the attested production branch and database. Return only the migration metadata from the query below. Keep every attempt as a separate row. The production export contains 64 unique applied names matching `origin/main`. The last applied name is `20260927160000_add_native_sessions`. Sixty-three checksums match the pinned release. The original SQL for `20260612215408_add_location_indexes` remains unrecovered. Its first available Git artifact matches the current SQL byte for byte and postdates the recorded production application.

The owner verified the production catalog: integer non-null `Park.id` defaults to `nextval('park_id_seq'::regclass)`; `public.park_id_seq` is a non-cycling bigint sequence with increment 1, automatically owned by `Park.id`; `Park.deletedAt` is nullable `timestamp(3) without time zone` with no default; `lat` and `lon` are non-null double precision; and both B-tree indexes are valid, ready, and live, with a unique `Park_pkey` on `id` and a non-unique `park_lat_lon_idx` on `(lat, lon)`. This verifies current schema properties. Historical SQL and historical sequence values remain unknown.

The runner can recognize exactly one pair for this name: production checksum `39da5fa21ae75fe764907d7045f49c111982b800490187af409ab81f998b6b3e` and repository checksum `9a99895f0a06ef284f574f463e06b08774990d79067fa987776a63d873481af2`. It is restricted to the approved production target and pinned release, requires the explicit owner approval flag, and repeats the catalog checks within the same verified read-only connection and transaction as the history check. Every other mismatch still blocks. No production migration-history records are modified by the exception. Evaluate staging independently under its own history and target. Recovery rehearsal remains mandatory before execution.

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

- Under separate approval, rehearse restore into an isolated, access-restricted branch with a separate endpoint and credentials. No production aliases, workers, or webhooks should point at the rehearsal branch. Verify restored migration attempts and checksums, required schema objects, and aggregate counts for users, workouts, workout photos, and relevant queues. Compare with the chosen recovery point without exporting personal records. Measure the time to establish a healthy recovered service, including validation and routing.
- Under the release freeze, capture the final approved recovery timestamp or LSN just before the migration. Confirm it can be selected for restore and remains within retention for the rollback window. Record the media copy manifest and the associated reference snapshot at the same cutover boundary. PostgreSQL restore does not restore R2.
- Record when to preserve the migrated schema and forward-fix, when a compatible app rollback is safe, and who can authorize a database restore. Account for writes and external billing, email, deletion, or moderation effects after the recovery point before restoring.

### Prepare private workout media

**Code verified, production inventory and bucket configuration unknown.** The old adapter uses the park-photo configuration, including its legacy fallback. The release adapter accepts only a separate `WORKOUT_PHOTO_R2_*` bucket and serves the same database storage key through the application route, which reevaluates access and sets `Cache-Control: private, no-store`. Public workouts can still be read according to the app's visibility rules. Park uploads and approval use their separate public URL scheme. The release has no bulk workout copy tool. `scripts/cleanup-pending-park-photos.mjs` targets pending park photos for deletion and is unsuitable for this cutover.

1. **Attest storage.** In Cloudflare, confirm the actual source bucket and all access paths for the current deployment: custom domains, `r2.dev`, Workers and cache. Verify a production-only private workout destination with no public route, and confirm the four `WORKOUT_PHOTO_R2_*` settings use that bucket, its R2 API endpoint, and bucket-scoped server credentials. Keep existing park configuration and approved public park URLs functional. Under approval, test destination access with a synthetic object and verify anonymous direct access is denied. [R2 public access](https://developers.cloudflare.com/r2/buckets/public-buckets/)
2. **Derive the copy set.** In a read-only snapshot of the attested database, count `WorkoutPhoto` rows, distinct valid `storageKey` values, and missing/invalid references. That table predates the pending migrations. Inspect available deletion and cleanup tables before querying them. The [nine-count staging SQL](../scripts/staging-attestation/photo-references.ts) references `User.deletedAt`, `AccountDeletion`, and `DeletionCommunityReviewTask`. Do not run it unchanged before those objects exist. After migration, repeat applicable aggregate checks before enabling workers. Keep any operational key manifest restricted and report only totals. A verified empty reference set plus stable counts through cutover permits no-copy. Existing referenced legacy objects require a verified private copy. Unknown or orphaned keys require separate review.
3. **Copy and verify before switching.** Under separate approval, dry-run the exact source/destination and key set. Use narrowly scoped read and write credentials, preserve each key and appropriate WebP metadata, and use private/no-store caching. Keep source objects while validating. Compare object counts, sizes and content digests, skip already verified matches, stop on mismatches or missing source objects, and make retries idempotent. Avoid overwriting divergent destination objects. Recheck the final reference and copy sets under the same freeze. Keeping the storage key and application photo route unchanged preserves existing references once each required object exists privately.
4. **Close legacy bypasses.** Before releasing hardened traffic, confirm that workout objects cannot be read through old public domains, `r2.dev`, Workers, or retained cache entries. Block legacy workout paths and purge affected shared caches, including cacheable old application photo responses where applicable. Preserve approved park assets and avoid disabling their shared domain without an alternate route. Previously downloaded or locally cached copies cannot be recalled.
5. **Coordinate deletion.** The hardened worker routes workout-key deletes to the private bucket and separately checks shared park references. It does not delete a retained legacy workout copy. Approve a plan to reconcile pending-only keys and delete eligible copies from both stores according to the account-deletion policy. Keep legacy originals inaccessible and retain them only for the authorized recovery window, with a defined owner and expiry. Resume deletion only after a controlled test confirms both the private deletion path and the disposition of legacy copies. Rollback must keep private media private and preserve access to newer objects.

## Phase B — Database preparation

Start only after Phase A is signed off and the approved production window and consistency controls are active.

1. Run `npm run --silent auth:email-collision-preflight -- --pre-migration` with an approved read-only connection and independently verified hostname. Stop on any nonzero exit. Resolve collisions through an approved procedure, then rerun. The CLI rejects `channel_binding=require` before connecting. If required by policy, use a separately reviewed preflight client that enforces it.
2. Reconfirm the exact ordered pending set just before DDL:

   1. `20261103120000_secure_multi_provider_auth`
   2. `20261103130000_account_deletion_foundation`
   3. `20261109120000_account_deletion_park_photo_lookup`
   4. `20261109123000_account_deletion_food_review_checkpoint`
   5. `20261109130000_auth_email_outbox_leases`
   6. `20261117210000_ugc_moderation`
   7. `20261119120000_harden_native_google_handoff`

3. Verify the final recovery point and obtain separate execution approval. In the approved window, use exactly one guarded runner. It re-attests the connection and migration history immediately before invoking Prisma. Stop if the runner guard fails, the pending set differs, or any migration fails or exceeds the agreed lock window. Inspect actual schema and attempt history before any recovery or retry.

   ```bash
   npm run --silent db:migrate:deploy -- --production --release b81e5349cf28ea97f4aa375a555c0d38174ffc00 --execute --authorize-production-migration --owner-approved-location-index-exception
   ```
4. Repeat reconciliation by name, checksum and status. Confirm the seven expected migrations completed and no unexpected pending or incomplete attempts remain. Record the approved historical discrepancy separately and verify the production digest remains unchanged. Verify the expected live tables, columns, enums, indexes and constraints. Run the post-migration collision check with `--post-migration`. Both checks must pass before hardened traffic or workers start.

## Phase C — Application release

1. Reconfirm the approved commit, migration and postflight evidence, final private media manifest, and coordinated rollback plan. Keep auth-email and account-deletion schedules and request enablement controlled until the new versions are verified.
2. Only now authorize the merge to `main` and the production deployment of the approved revision. Keep the maintenance gate in place. Where separately approved and verified, use a staged production deployment with manual promotion. [Vercel production promotion](https://vercel.com/docs/deployments/promoting-a-deployment)
3. On the intended revision, verify production deployment identity, database connection, Stripe mode, and private R2 configuration. Smoke-test login/session, representative queries, owner and unauthorized photo access, private/no-store responses, legacy path denial, park media, and API/worker health. Check pre-release native client compatibility with the hardened Google proof exchange. Promote or reopen traffic only after checks pass.

## Phase D — Post-release and recovery decisions

- With approved test accounts, verify Google and Apple sign-in, account-deletion reauthentication and cleanup, workouts and private media, park assets, Stripe and StoreKit entitlements and webhook handling, moderation and user-generated content, auth email delivery and retries, scheduled jobs, and public Support, Privacy, Terms, and Community Guidelines. Use sandbox billing where appropriate. Enable and observe the verified deletion worker before accepting deletion requests.
- Monitor errors, lock waits, queue age and retries, storage misses, and payment notifications. Record each gate, release SHA, deployment ID, migration attempts, recovery timestamp, and aggregate media results. Keep secrets and object keys out of the release record.
- On an identity mismatch, failed migration, unexpected checksum discrepancy, unexpected data change, media exposure, or failed smoke test, halt progression and keep writes or workers paused. Before hardened writes, the prior revision can be considered only if compatible with the additive schema and the current private media policy. After new auth, deletion, moderation or media writes, favor a compatible forward fix. Use a Neon restore only under separate incident approval with an explicit plan for writes and external side effects since recovery and for matching R2 objects. Never restore public access as a rollback shortcut.
