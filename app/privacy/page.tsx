import type { Metadata } from "next";
import { PublicSiteFooter } from "@/components/navigation/PublicSiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Calistheni handles personal information.",
};

const sections = [
  [
    "Information we handle",
    "Calistheni handles account and profile details, authentication records, workouts and routines, progress and body measurements, nutrition entries, social content and relationships, park contributions, support messages, and billing entitlement identifiers. If you grant device permissions, native features may also handle photos, camera input, location, notifications, and HealthKit data for the feature you request.",
  ],
  [
    "How we use information",
    "We use this information to operate and secure your account, provide requested training and community features, synchronize your data, verify paid entitlements, prevent abuse, respond to support requests, and comply with legal obligations. We do not use Apple health data for advertising or sell it.",
  ],
  [
    "Service providers and payments",
    "We use service providers for hosting, databases, authentication, email, file storage, mapping, analytics needed to operate the service, and payment processing. Website payments are processed by Stripe. Native iOS purchases are processed by Apple. Calistheni receives billing and entitlement identifiers, not your complete payment-card details or Apple Account password.",
  ],
  [
    "Public and community information",
    "Information you intentionally publish, such as a public profile, shared workout, comment, or approved park contribution, can be visible to other people. Reporting and blocking controls are available in the app. Reporter identity is not disclosed to the reported user.",
  ],
  [
    "Retention and account deletion",
    "You can request account deletion from Profile settings. The account becomes inaccessible immediately and personal information is deleted or anonymized through the documented cleanup process. Limited transaction, fraud-prevention, dispute, tax, or accounting records may be retained where necessary. Deleting a Calistheni account does not cancel an Apple or Stripe subscription.",
  ],
  [
    "Your choices",
    "You can update profile information, control device permissions in iOS Settings, manage blocked users, manage or cancel subscriptions through the provider used for purchase, and request account deletion in the app. Contact us to ask a privacy question or exercise an applicable data right.",
  ],
] as const;

export default function PrivacyPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-primary">Calistheni legal</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective 18 November 2026</p>
        <p className="mt-6 leading-7 text-muted-foreground">
          This policy explains how Calistheni handles information when you use
          the website or native application.
        </p>
        <div className="mt-10 space-y-8">
          {sections.map(([title, body]) => (
            <section key={title} className="space-y-2">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Contact</h2>
            <p className="leading-7 text-muted-foreground">
              Privacy and support enquiries: {" "}
              <a className="underline underline-offset-4" href="mailto:hello@calistheni.app">
                hello@calistheni.app
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <PublicSiteFooter />
    </>
  );
}
