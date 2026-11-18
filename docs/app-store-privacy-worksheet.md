# App Store Connect privacy worksheet — Day 7D

Status: evidence-based engineering draft, not submitted. Reconfirm answers
against the release build, deployed vendor settings, and the App Store Connect
definitions before publication. “Collected” below includes collection by
third-party services where evidenced; on-device-only processing and transient
requests are distinguished.

| Apple data type | Collected | Linked to identity | Tracking | Purpose and flow | Evidence / processor | Owner verification |
|---|---|---|---|---|---|---|
| Name | Yes | Yes | No | Account/profile identity; user-provided | `User.name`, public profile and auth code; Calistheni/Neon | Confirm final profile fields |
| Email address | Yes | Yes | No | Account sign-in, verification and security email; business partner inquiries are separate | `User.email`, password/auth flows, `PartnerInquiry.email`; Calistheni/Neon, Resend or configured Brevo SMTP | Confirm active email provider configuration and retention |
| Other user contact information | Yes | Yes to the inquiry/contact identity; not linked to a Calistheni account by schema | No | Business name, contact name, website, location, and proposed reward submitted in partner inquiries | `PartnerInquiry`; Calistheni/Neon and Resend | Confirm inquiry retention and whether all fields remain necessary |
| User ID | Yes | Yes | No | Account ownership, authorization, records and entitlements | `User.id`, session and service models; Calistheni/Neon | No additional source review identified |
| Other data types | Yes | Yes | No | Optional date of birth, body-composition inputs, and profile/training preferences used by the corresponding account features | `User.dateOfBirth`, `User.bodyFatSex`, training and goal fields; Calistheni/Neon | Owner to confirm whether body-composition sex selection should also be disclosed as Sensitive Info |
| Device ID | Yes (third-party SDK) | Yes (pseudonymous app-install identifier; not joined to Calistheni account in app source) | No | Mapbox GL JS anonymous telemetry identifier | Bundled `mapbox-gl` 3.24 telemetry implementation; Mapbox | Confirm identifier semantics and whether App Store classification as linked is correct |
| Precise location | Yes | Yes (park-photo verification coordinates are stored with the linked park contribution; Mapbox also receives map/directions requests) | No evidence of tracking | Optional park-photo verification reads photo EXIF GPS or requests browser location, then stores exact coordinate, source, and distance with the park submission for authorized moderator review. Mapbox receives the viewed map area and, for explicitly requested directions, route origin/destination. Park viewport and duplicate-check coordinates use JSON request bodies rather than URL query strings; the nearby check itself does not persist them. | `components/user/ParkSubmissionForm.tsx`, `lib/photo-location-verification.ts`, `app/api/user/parks/route.ts`, park edit route, `components/ParksMap.tsx`; Calistheni/Neon, Vercel and Mapbox | Confirm retention period/access policy for stored park-verification coordinates and verify Mapbox deployed account/log settings |
| Coarse location | Unconfirmed | Unconfirmed | No evidence of tracking | Map viewport and nearby park discovery may indicate an area; park coordinates represent parks, not necessarily the user | Same sources as precise location | Confirm whether disclosure is required after vendor review |
| Health | Yes | Yes | No | Optional HealthKit body/profile measurement read/write; body measurements, nutrition, and wellness records entered or saved to account | `lib/native/apple-health.ts`, `lib/apple-health-capabilities.ts`, measurement and nutrition APIs; Apple HealthKit and Calistheni/Neon | Confirm final HealthKit capability and data types in signed archive |
| Fitness | Yes | Yes | No | Workouts, exercise sets, progress, supplement logs/reminders, and optional HealthKit workout export | Prisma workout/progress/supplement models, workout APIs, `lib/apple-health-workout.ts`; Calistheni/Neon and Apple HealthKit | Confirm final release feature set |
| Photos or videos | Yes | Yes | No | Optional workout/park/community image upload; optional nutrition image analysis | R2 upload services and nutrition image route; Cloudflare R2, OpenAI for analysis inputs | Confirm deployed image and OpenAI account handling |
| Other user content | Yes | Yes | No | Workout notes, comments, park submissions, reports, explanations, nutrition descriptions, partner inquiry messages | Prisma social/park/moderation/nutrition models and APIs; Calistheni/Neon; OpenAI for submitted nutrition description | Confirm whether partner inquiry should be treated separately in App Store answers |
| Purchase history | Yes | Yes | No | Subscription entitlement, transaction state and provider reconciliation | `Subscription`, `ApplePurchase`, `AppleTransaction`, billing routes; Stripe and Apple | Confirm final production product configuration separately; card data is not collected by Calistheni |
| Product interaction | Yes | Yes for account-side activity records; Mapbox SDK events are pseudonymous | No evidence of tracking | Throttled account activity, feature counters and anonymous Mapbox map/style telemetry | `lib/user-activity.ts`, nutrition usage models, bundled Mapbox GL JS telemetry; Calistheni/Neon and Mapbox | Confirm exact App Store linkage selection and Mapbox SDK release behavior |
| Search history | Unconfirmed (transient request; no Calistheni saved search-history row) | Yes within authenticated Calistheni request; external provider linkage unknown | No | Food search terms are sent to the authenticated Calistheni API and may be sent to USDA FoodData Central or Open Food Facts in POST request bodies. Barcode values are sent to Open Food Facts when required. Searches against the synchronized Fineli catalogue are local and are not sent to Fineli per query. Whether transient requests count as collection depends on provider/platform retention beyond the request. | `components/nutrition/*` callers, `app/api/nutrition/foods/search/route.ts`, `app/api/nutrition/foods/barcode/lookup/route.ts`, `lib/nutrition/service.ts`; USDA and Open Food Facts | Confirm provider query logging and deployed Vercel request-body handling before final selection |
| Customer support | Unconfirmed / not collected by in-app form | N/A | No | Support link opens the user’s email client; business partner inquiry is a separate feature | Privacy/Terms `mailto:`; `PartnerInquiry` model | Confirm whether support mailbox creates support records outside the app |
| Payment information | No (Calistheni does not receive card credentials from Stripe/Apple purchase flows) | N/A | No | Payment entry and processing occur with Stripe or Apple | Stripe Checkout/portal and StoreKit integration | Confirm no future client-side payment form changes this |
| Diagnostics | Unconfirmed | Unconfirmed | No evidence of tracking | Vercel/platform operational logs may include request metadata; no application analytics/diagnostics SDK found | Vercel runtime logging documentation; platform configuration not inspected | Confirm plan, log settings, and any enabled error-monitoring integrations |
| Contacts, audio, browsing history, advertising data | No evidence in app source | N/A | No | No corresponding collection or SDK behavior found | Repository/package/import review | Recheck release dependency inventory |

## Manifest mapping

The app manifest includes Name, EmailAddress, OtherUserContactInfo, UserID,
OtherDataTypes, Fitness, PreciseLocation, Health, PhotosorVideos,
OtherUserContent, PurchaseHistory, ProductInteraction, and DeviceID.
Account-linked service data is marked AppFunctionality;
ProductInteraction is linked to the Calistheni account for support/service
operation, and the persistent Mapbox GL JS telemetry DeviceID is marked
Analytics and linked conservatively pending owner confirmation. `NSPrivacyTracking`
remains false and `NSPrivacyTrackingDomains` is explicitly empty. Apple states
that a privacy manifest does not need to repeat data collected by third-party
SDKs that the app links, but Mapbox GL JS runs in the app’s WebView rather than
as a linked native SDK; confirm that this app-manifest mapping is appropriate
for the submitted binary.

PreciseLocation is included because park-photo verification coordinates are
stored with linked park-submission records for authorized moderator review.
SearchHistory is not included because the app does not retain saved search
history and provider retention is unresolved; revisit if provider evidence
shows retention beyond the request. CoarseLocation is not separately declared. Mapbox provider-side retention and
its treatment of map/directions requests still require account and release
verification. Diagnostics and CustomerSupport are not declared without
evidence of app-collected information in those categories.

Apple manifest data types and App Store privacy answers are related but are
not interchangeable; validate the manifest against Apple’s current schema and
complete the App Store Connect questionnaire independently.

## Confirmed processors and unresolved settings

- Apple: Sign in with Apple, HealthKit on user choice, and StoreKit purchases.
- Google: OAuth sign-in.
- Stripe: website subscription checkout/management and billing lifecycle.
- Mapbox: map styles/tiles, park route directions, anonymous map telemetry;
  its published policy describes processing and IP log handling, but Calistheni
  account-level controls were not inspected.
- Cloudflare R2: uploaded workout and park images; bucket access/log settings
  were not inspected.
- Neon and Vercel: application data and hosting; deployed project/log settings
  were not inspected in this source-only task.
- Resend: partner inquiry delivery; authentication email selects Resend by
  default or Brevo SMTP when configured.
- USDA FoodData Central and Open Food Facts: food search/barcode requests may
  transmit the query or barcode. Provider logging was not verified. Fineli is
  synchronized into Calistheni’s local catalogue; individual search queries
  are not sent to Fineli, though the batch synchronization itself uses its
  service.
- OpenAI: nutrition images, descriptions, and food-candidate inputs are sent
  to Responses API requests with `store: false`. OpenAI’s current API data
  controls documentation says default abuse-monitoring logs may contain
  content and are retained up to 30 days, subject to exceptions. `store:false`
  does not prove abuse-monitoring retention is disabled; Calistheni’s account
  configuration was not inspected.

## Vendor documentation reviewed

- Apple defines “linked to identity” to include linkage through an account,
  device, or other details; “tracking” concerns linking to third-party data
  for advertising/measurement or sharing with a data broker. The Mapbox
  telemetry row therefore remains a conservative declaration pending owner
  review of the exact identifier and linkage.
- Mapbox documents `events.mapbox.com` as an endpoint for anonymized user
  telemetry and states that its location telemetry does not record advertising
  identifiers. This does not establish Calistheni’s Mapbox account settings or
  determine how App Store Connect should classify every telemetry field.
- Vercel runtime logs expose request paths and search parameters. Food search,
  barcode lookup, map viewport, and nearby-coordinate calls now send those
  values in POST bodies; application code does not log their values. This does
  not establish the platform’s body handling, log retention, or other request
  metadata settings.
- Cloudflare documents optional R2 Data Access Logs, which include object keys
  and request metadata and have seven-day retention when enabled. Whether this
  feature is enabled for Calistheni’s buckets was not inspected.
- OpenAI’s API documentation says default abuse-monitoring logs may retain
  content for up to 30 days, subject to exceptions. The account’s retention
  configuration was not inspected.

## Sources for review

- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple collected-data types](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
- [Mapbox GL JS security and telemetry endpoint](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/)
- [Mapbox Privacy Policy](https://www.mapbox.com/legal/privacy)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Vercel runtime logs](https://vercel.com/docs/logs/runtime)
- [Cloudflare R2 data access logs](https://developers.cloudflare.com/r2/buckets/data-access-logs/)
