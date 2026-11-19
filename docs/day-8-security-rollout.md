# Day 8 security rollout

## Security controls

- Require proof-bound, single-use native Google sign-in handoffs and verify account ownership before sensitive linking or reauthentication.
- Apply durable throttling to admin sign-in and native authentication attempts.
- Validate deployment identity before database access and restrict live billing to the approved production environment.
- Serve workout photos through authorization checks and private storage. Prevent caching of protected image responses.
- Apply an additive Prisma migration for the native authentication handoff.

## Staging verification

Use separate staging credentials and synthetic fixtures. A protected, read-only check verifies that the deployment connects to the intended database. Review migration readiness, photo authorization, and authentication behavior before promoting a build.

## Readiness

Staging acceptance remains pending.
