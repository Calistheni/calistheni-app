import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Mail } from "lucide-react";
import { PublicSiteFooter } from "@/components/navigation/PublicSiteFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const title = "Calistheni Support";
const description =
  "Need help with Calistheni? We're here to help. Contact us with any questions, feedback, or issues you experience.";
const supportEmail = "hello@calistheni.app";
const supportEmailHref = `mailto:${supportEmail}`;

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/support" },
  openGraph: { title, description, url: "/support", siteName: "Calistheni" },
  twitter: { card: "summary", title, description },
};

export default function SupportPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 py-10 sm:px-6 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          <p className="max-w-prose leading-7 text-muted-foreground">{description}</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Mail className="size-5" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold">Email</h2>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="min-h-11">
                <a href={supportEmailHref}>{supportEmail}</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Camera className="size-5" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold">Instagram</h2>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="min-h-11">
                <a
                  href="https://www.instagram.com/calistheniapp/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @calistheniapp
                  <span className="sr-only"> on Instagram (opens in a new tab)</span>
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="support-faq" className="space-y-4">
          <h2 id="support-faq" className="text-2xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
          <dl className="divide-y rounded-xl border bg-card px-4 text-card-foreground sm:px-6">
            <div className="space-y-1 py-4">
              <dt className="font-semibold">How do I report a problem?</dt>
              <dd className="text-sm leading-6 text-muted-foreground">
                Email{" "}
                <a className="text-foreground underline underline-offset-4" href={supportEmailHref}>
                  {supportEmail}
                </a>
                .
              </dd>
            </div>
            <div className="space-y-1 py-4">
              <dt className="font-semibold">How do I manage my subscription?</dt>
              <dd className="text-sm leading-6 text-muted-foreground">
                If you subscribed through Apple, open Settings on your iPhone, tap your name,
                then tap Subscriptions. If you subscribed on the Calistheni website,
                open your profile and select Manage Subscription.
              </dd>
            </div>
            <div className="space-y-1 py-4">
              <dt className="font-semibold">How do I delete my account?</dt>
              <dd className="text-sm leading-6 text-muted-foreground">
                Sign in, open your{" "}
                <Link className="text-foreground underline underline-offset-4" href="/profile">
                  Calistheni profile
                </Link>
                , then scroll to Delete Account and follow the prompts.
              </dd>
            </div>
          </dl>
        </section>
      </main>
      <PublicSiteFooter />
    </>
  );
}
