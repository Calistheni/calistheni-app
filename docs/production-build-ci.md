# Production build verification workflow

`.github/workflows/production-build.yml` runs on pushes, pull requests, and
manual dispatch. It uses Ubuntu 24.04 and Node.js 22, matching the repository's
`node >=22` engine requirement. It installs the lockfile with `npm ci`, then
runs Prisma generation/validation, TypeScript, the full regular test suite,
ESLint, the required PostgreSQL integration suite, and the default
`npm run build` command. A failure in any step fails the job; the workflow
does not select webpack, deploy, publish artifacts, run production migrations,
or build/upload iOS binaries.

The job has read-only repository permissions. A PostgreSQL 18 service is
created per job with a synthetic database, username, and password. The job
applies repository migrations to that service and runs `npm run test:integration`.
`REQUIRE_DATABASE_INTEGRATION=1` makes the test helper fail if the URL is absent
or is not localhost and test-named, rather than silently skipping database
tests. Test files run sequentially because they share the disposable database;
concurrent files could consume one another's queued outbox fixtures. The job
also uses synthetic `AUTH_SECRET` and token-encryption values. Do not add
production credentials to this workflow. Build success must not depend on
production secrets or production services.

For local execution, start an isolated PostgreSQL instance and set
`DATABASE_URL` and `AUTH_TEST_DATABASE_URL` to its test-named database, then run
`npx prisma migrate deploy` and `npm run test:integration`. The required-mode
guard deliberately fails when the test URL is missing or not local.

To inspect a result, open the repository's **Actions** tab, select
**Production build verification**, then open the run and its **Validate and
build** job. Check the commit SHA and confirm the **Run default production
build** step completed successfully. A checked-in workflow or a locally
successful webpack build is not evidence that the GitHub Actions Turbopack
build passed; require a completed green run for the intended commit.
