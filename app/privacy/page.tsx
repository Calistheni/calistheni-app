import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteFooter } from "@/components/navigation/PublicSiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Calistheni handles personal information.",
};

export default function PrivacyPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-primary">Calistheni legal</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective 19 November 2026</p>
        <p className="mt-6 leading-7 text-muted-foreground">
          This policy describes information handled by Calistheni when you use
          the website or iOS app. Some features are optional. Information you
          submit to a feature is handled for that feature; information you
          choose to publish may be visible to other users.
        </p>

        <div className="mt-10 space-y-8 leading-7 text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Information stored by Calistheni</h2>
            <p>
              Account information can include your name, email address, username,
              profile image, date of birth, selected body-composition inputs,
              authentication-provider references, and account preferences. The
              app stores workouts, exercises and sets, workout notes and images,
              progress records, body measurements, nutrition logs and goals,
              supplement logs and reminders, saved foods, and other records
              needed for features you use. These records are associated with
              your account. Body
              measurements and nutrition logs are private unless a specific
              feature clearly lets you share them; public workout sharing does
              not publish your body measurements or nutrition history.
            </p>
            <p>
              Community records can include public profile details, workouts
              you mark public, comments, reactions, follows, blocks, park
              submissions and edits, reports, and moderation actions. Reports
              and moderation records are used to review safety issues; reporter
              identity is not shown to the reported user. Partner inquiry forms
              separately collect business and contact details and a message.
              A partner inquiry is not automatically erased just because an
              account with the same email is deleted.
            </p>
            <p>
              Images submitted for workout or park features are stored in
              Cloudflare R2 and referenced by records in the application
              database. Public park images can be shared community material.
              Workout images are re-encoded as WebP and park images as JPEG
              before storage, removing embedded image metadata. Deletion
              cleanup checks whether media is
              still referenced before removing an object. Map locations for
              parks describe the park, not necessarily the person using the app.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Sign-in, security, and service operation</h2>
            <p>
              Sign-in can use Apple, Google, or email/password where available.
              Authentication and security records can include provider account
              identifiers, session and authorization state, expiring token
              hashes, rate-limit hashes, account activity timestamps, and
              delivery status for sign-in emails. These records support
              authentication, account security, abuse prevention, and service
              operation. The app also stores subscription entitlement and
              transaction references needed to provide Pro and reconcile
              billing events.
            </p>
            <p>
              Calistheni uses account-linked records for first-party analytics.
              We measure sign-ups, active accounts, feature use, workout
              activity, and subscription trends such as plan mix and scheduled
              cancellations. Authorized administrators can review account
              activity, including nutrition logging frequency and summaries, for
              support and to understand how the app is used. These records are
              not used for advertising.
            </p>
            <p>
              Calistheni is hosted on Vercel, uses Neon PostgreSQL for
              application data, and uses Cloudflare R2 for application media.
              These providers process information as part of delivering the
              service. Operational and security logs can include technical
              events, request paths, and URL parameters. This can include terms
              from searches that use URLs, such as exercise and people searches.
              Log access and retention depend on the service and its settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Nutrition tools and outside food services</h2>
            <p>
              Optional AI nutrition features ask you to confirm before sending
              information to OpenAI. Depending on the feature, Calistheni sends a
              meal or nutrition-label photo, a meal description, or food names
              and context for matching or proposing a nutrition entry. You can
              decline and use food search or manual entry. Calistheni does not
              add the submitted AI photos to your profile. Nutrition entries you
              choose to save are stored in your account.
            </p>
            <p>
              Calistheni sends OpenAI Responses API requests with{" "}
              <code>store: false</code>. OpenAI may still retain request content
              for abuse monitoring. Its published default is up to 30 days,
              subject to exceptions. The retention controls on Calistheni&apos;s
              OpenAI account have not been verified here. Avoid including
              personal details unrelated to the food or label.
            </p>
            <p>
              Food search can send a search term to USDA FoodData Central or
              Open Food Facts, and barcode lookup can send a barcode to Open
              Food Facts. The synchronized Fineli catalogue is searched locally;
              an individual search is not sent to Fineli. Calistheni stores nutrition entries
              you save in your account. The app does not offer a saved food
              search history. Food search terms are sent in the
              authenticated search or barcode-lookup request body and may be
              sent to the selected food provider. Barcode values are not stored
              in Calistheni activity records. Provider-side logging and retention
              practices depend on those services and are not controlled by
              Calistheni.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Location and maps</h2>
            <p>
              Mapbox provides map styles, tiles, and related map services for
              park discovery and park submission. If you choose the map&apos;s
              location control, iOS/browser location is used to center the map
              and find nearby parks. Permission is optional; you can browse or
              move the map manually. Calistheni does not keep a location history
              for map browsing. Map requests necessarily reveal the viewed map
              area to Mapbox. When you choose Directions, Calistheni passes the
              park coordinates and, where supported, the park name to Apple Maps
              or Google Maps. The selected provider handles directions under
              its own privacy policy. Calistheni checks park
              coordinates submitted by a user for nearby existing parks; those
              coordinates are sent in a request body and are not stored by that
              check itself.
            </p>
            <p>
              Mapbox GL JS sends map and style usage events and collects map
              performance metrics, which can include load timing, browser
              information, and display characteristics. It uses a rotating
              identifier stored in the browser or app WebView for map usage
              events. Calistheni does not attach its account ID to those events.
              Mapbox receives network information such as IP addresses when
              serving requests. Retention and linkage within Mapbox depend on
              its data handling and have not been independently verified here.
            </p>
            <p>
              When you submit or edit a park photo, Calistheni may read GPS
              coordinates embedded in the selected image. If the image has no
              GPS data, the flow may request your device location to compare
              where the photo was taken with the park location. The precise
              photo/device coordinate, source, and distance are stored with
              the account-linked park submission for authorized moderator
              review and are not included in public park responses. The image
              is re-encoded before storage so its
              embedded metadata is not published with the image. We have not
              set a separate retention period for this review information;
              shared park records and account-deletion review can affect when
              it is cleared.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Optional Apple Health</h2>
            <p>
              On supported iOS devices, you may connect Apple Health. Calistheni
              requests only supported workout and body-measurement types for
              the features shown in the connection settings. With your action,
              the app can read available body mass, waist, height, body fat,
              date of birth, and biological sex, depending on your settings
              and permissions, and can write workouts and selected body
              measurements to Health. Read access is controlled by iOS; the app
              cannot determine from the HealthKit authorization-request status
              whether read access was granted. Health-derived values that you
              choose to use in Calistheni can be saved to your Calistheni
              account. HealthKit access is optional and is not used for
              advertising. Denying access does not block unrelated features.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Subscriptions and purchases</h2>
            <p>
              Website subscriptions are processed by Stripe. Native iOS
              subscriptions and purchase restoration use Apple StoreKit. The
              app receives provider transaction and entitlement details such
              as product, status, dates, and identifiers; payment card details
              are handled by the payment provider. Apple subscription
              verification and lifecycle notifications are processed by
              Calistheni&apos;s server. Apple and Stripe maintain their own records
              under their policies.
            </p>
            <p>
              Deleting your Calistheni account does not cancel an Apple or
              Stripe subscription. Cancel or manage it through the provider
              used to subscribe. Limited billing references, transaction
              reconciliation information, security records, and moderation
              audit information may remain after account deletion where needed
              for the documented account-deletion process, billing operations,
              security, or review. Applicable retention periods and access
              policies for those retained records require legal and operational
              review; no fixed statutory period is stated here.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Public content and controls</h2>
            <p>
              Your public profile fields and workouts you explicitly mark public
              can be viewed by visitors, including people who are signed out.
              Public workout details can include
              title, notes, exercise and set details, derived workout
              statistics, and photos attached to the public workout. Body
              measurements, nutrition logs, email address,
              billing identifiers, and HealthKit records are not included in
              public workout responses. Approved park photos are displayed
              publicly. Comments and other park contributions are visible
              according to the feature&apos;s presentation and approval state.
              You can report content, block users, change profile and
              workout visibility where supported, and manage permissions in iOS
              Settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Deletion and retention</h2>
            <p>
              You can request account deletion from Profile settings. The
              account is deactivated and sessions are revoked when an eligible
              request is accepted; a background process then removes or
              anonymizes personal account data. The documented workflow aims
              to complete personal-data cleanup within 30 days, but shared
              contributions requiring review, provider failures, or retryable
              media cleanup can affect completion. Approved park information
              may remain after attribution and personal details are removed.
              Some billing references, deletion workflow records, and
              moderation audit records are retained separately. Deleting your
              account does not remove information you previously shared with
              other services or cancel a subscription.
            </p>
            <p>
              Apple Health samples already written to the Health app are managed
              in Apple Health and are not removed by deleting a Calistheni
              account. A separate partner inquiry is not automatically deleted
              based only on an email match. Contact us to ask about information
              held separately or to exercise a privacy right that applies to
              you.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Your choices and providers</h2>
            <p>
              You can edit account details, choose whether to make workouts
              public, use block/report tools, deny optional device permissions,
              disconnect Apple Health, manage purchases with Apple or Stripe,
              and request account deletion in the app. The service uses Apple
              and Google for sign-in, Apple for StoreKit and HealthKit, Stripe
              for web billing, Mapbox for maps, Cloudflare for media storage,
              Neon for database hosting, Vercel for application hosting, Resend
              for partner inquiry email and the configured Resend or Brevo
              provider for authentication email. External food data providers
              and OpenAI are used for the nutrition features described above.
              Their own privacy terms also apply to information they receive.
            </p>
            <p>
              The app does not include an advertising SDK or an integration for
              cross-app advertising tracking in the reviewed source. This
              assessment does not verify provider account settings or every
              network-level log generated by service providers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Contact</h2>
            <p>
              Privacy and support enquiries: {" "}
              <a className="underline underline-offset-4" href="mailto:hello@calistheni.app">
                hello@calistheni.app
              </a>
              . See the {" "}
              <Link className="underline underline-offset-4" href="/terms">Terms of Use</Link>
              .
            </p>
          </section>
        </div>
      </main>
      <PublicSiteFooter />
    </>
  );
}
