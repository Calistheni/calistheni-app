import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteFooter } from "@/components/navigation/PublicSiteFooter";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing use of Calistheni.",
};

export default function TermsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-primary">Calistheni legal</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Terms of Use</h1>
        <p className="mt-3 text-sm text-muted-foreground">Effective 18 November 2026</p>
        <div className="mt-10 space-y-8 leading-7 text-muted-foreground">
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Using Calistheni</h2>
            <p>
              You must provide accurate account information, keep your sign-in
              methods secure, and use Calistheni lawfully. Training information
              is educational and is not medical advice. Exercise within your
              abilities and seek qualified advice when appropriate.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Community content</h2>
            <p>
              You retain responsibility for content you submit and grant
              Calistheni the permission needed to host and display it as part of
              the service. Public content must follow the {" "}
              <Link className="underline underline-offset-4" href="/community-guidelines">
                Community Guidelines
              </Link>
              . We may hide or remove violating content and restrict abusive accounts.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Pro purchases</h2>
            <p>
              Pro unlocks the features described on the purchase screen. iOS
              subscriptions are processed by Apple and renew automatically at
              the displayed price and interval unless cancelled at least 24
              hours before the end of the current period. Website purchases are
              processed by Stripe. Manage or cancel through the provider used
              for purchase. Removing the app or deleting your Calistheni account
              does not itself cancel a subscription.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Availability and changes</h2>
            <p>
              We work to keep the service available but do not promise
              uninterrupted operation. Features may change for security,
              reliability, legal, or product reasons. Existing lifetime access
              remains recognized according to the purchase terms under which it
              was granted.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Account termination</h2>
            <p>
              You may delete your account in Profile settings. We may suspend or
              terminate access for serious misuse, security threats, or repeated
              violations. Billing records may be retained where required for
              accounting, tax, fraud prevention, or dispute handling.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Contact</h2>
            <p>
              Questions about these terms: {" "}
              <a className="underline underline-offset-4" href="mailto:hello@calistheni.app">
                hello@calistheni.app
              </a>
              . See the {" "}
              <Link className="underline underline-offset-4" href="/privacy">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <PublicSiteFooter />
    </>
  );
}
