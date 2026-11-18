# Post-merge testing backlog

Status: pending. Items below have not been represented as passed by the Day 7D
local engineering checks. Use staging or explicitly approved test fixtures;
production data and production systems are not test targets unless separately
authorized.

## Day 5 — moderation acceptance

- Exercise report submission for real workout, comment, and profile content
  using explicitly authorized test accounts.
- Verify duplicate-report and rate-limit behavior in the deployed environment.
- Verify block/unblock filtering, moderation review, hide/restore, restriction
  and restoration, and reporter-identity privacy with authorized test users.
- Confirm existing park approval workflows remain intact.

## Day 6 — StoreKit acceptance

- Complete Apple Sandbox purchase and restore verification on the signed iOS
  build, including entitlement sync, renewal, expiration, refund/revocation,
  grace period, notification delivery, account switching, and reinstallation.
- Verify server notifications and provider ownership reconciliation using
  configured App Store Connect Sandbox products. No purchase or notification
  lifecycle test is claimed complete by Day 7D.

## Day 7 — privacy and permissions acceptance

- On a physical iPhone, verify PHPicker selection, camera and barcode
  permission denial/recovery, and cancellation behavior.
- Verify location permission denial/recovery, explicit opt-in, and manual map
  navigation without permission.
- Verify HealthKit authorization messaging and optional feature behavior.
- Open Privacy Policy, Terms of Use, and Community Guidelines from the native
  app and verify external links remain usable.
- Verify the account deletion screen and subscription legal links without
  submitting a deletion request.
- Inspect a final signed iOS archive privacy report and confirm the app and
  embedded SDK privacy manifests are included and accepted by Xcode/App Store
  validation.
- Verify third-party SDK signatures and privacy manifests in the final
  archive, including the Mapbox web SDK bundled into the remote application.
- Confirm deployed Mapbox and Vercel request/log data flows after the map
  coordinate endpoints use request bodies; verify that coordinates do not
  appear in request URLs or routine request logs.
- Verify server-side workout and park image normalization removes EXIF/XMP
  metadata from R2 objects for user and administrator upload paths, while
  precise park-photo verification coordinates remain available only to
  authorized moderation surfaces and are not returned by public APIs.
- Have the owner approve the retention and access policy for stored precise
  park-photo verification coordinates.
- Confirm production provider settings and retention practices for Mapbox,
  Vercel, Cloudflare R2, OpenAI, and email delivery with their account owners.
- Reassess whether Mapbox map requests and anonymous telemetry constitute
  collected location, device identifier, or product-interaction data under
  Apple's definitions; update privacy disclosures if verified behavior
  differs from this source audit.
- Run PostgreSQL integration tests only when a separately verified isolated
  `AUTH_TEST_DATABASE_URL` is available. Never use `DATABASE_URL` as a
  fallback.
- Have the owner validate the final App Store Connect privacy answers against
  the actual deployed provider settings and the worksheet delivered for Day
  7D.

## Owner/legal review

- Confirm the applicable retention period and access policy for restricted
  Stripe/Apple billing references, deletion workflow/tombstone records,
  moderation audit records, authentication rate-limit records, and partner
  inquiries. The source audit does not establish statutory retention periods.
- Decide whether and how a former account holder can request deletion of a
  separately submitted `PartnerInquiry`; do not automatically delete inquiries
  based only on matching email addresses.
- Confirm the provider account's OpenAI API retention controls and whether the
  documented `store: false` requests match the deployed account configuration.
- Confirm the data-processing/retention terms applicable to the active email
  provider, Mapbox account, Vercel project plan, Cloudflare R2 logging, and
  food-data providers.
- Approve the substantive Privacy Policy and Terms wording before App Store
  submission.
