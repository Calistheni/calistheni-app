# Day 8 security rollout

## Security controls

- Require proof-bound, single-use native Google sign-in handoffs and verify account ownership before sensitive linking or reauthentication.
- Apply durable throttling to admin sign-in and native authentication attempts.
- Validate deployment identity before database access and restrict live billing to the approved production environment.
- Serve workout photos through authorization checks and private storage. Prevent caching of protected image responses.
- Apply an additive Prisma migration for the native authentication handoff.

## Staging verification

Use separate staging credentials and synthetic fixtures. A protected, read-only check verifies that the deployment connects to the intended database. Review migration readiness, photo authorization, and authentication behavior before promoting a build.

## Private storage readiness

Verification covers private object access, cleanup references, and protection against direct public access. Recheck data references before switching storage. Keep any transfer and verification scoped to the intended environment.

## Diagnostic compatibility

Focused regression tests cover authenticated diagnostic requests through the hosting platform. The diagnostic requires HTTPS and rejects unexpected request bodies.

## Readiness

Staging acceptance remains pending.
