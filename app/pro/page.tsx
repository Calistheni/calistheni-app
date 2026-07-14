import type { Metadata } from "next";
import { auth } from "@/auth";
import { CheckoutButtons } from "@/components/billing/CheckoutButtons";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  getFriendlySubscriptionPlan,
  getFriendlySubscriptionStatus,
  getUserEntitlements,
} from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Calistheni Pro",
  description: "Compare Calistheni Free and Pro plans.",
};

const FREE_FEATURES = [
  "Unlimited workout logging",
  "Workout timer and rest timer",
  "Exercise library",
  "Park map",
  "Social feed",
  "Up to 4 routines",
  "Up to 7 custom exercises",
  "No Calis Points earning",
];

const PRO_FEATURES = [
  "Unlimited routines",
  "Unlimited custom exercises",
  "Eligible to earn Calis Points when earning rules launch",
  "Full progress history when the expanded history feature launches",
  "Future advanced Pro features",
];

export default async function ProPage() {
  const session = await auth();
  const result = session?.user?.id
    ? await getUserEntitlements(session.user.id)
    : null;
  const subscription = result?.subscription ?? null;
  const isPro = result?.entitlements.isPro ?? false;

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <section className="mb-8 space-y-3 text-center">
        <Badge variant="secondary">Calistheni Pro</Badge>
        <h1 className="text-4xl font-bold sm:text-5xl">Train without limits.</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Keep every core training tool on Free, or unlock higher limits and
          eligibility for future Pro benefits.
        </p>
      </section>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-2xl font-bold">Free</h2>
            <p className="text-sm text-muted-foreground">Core training and community tools.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {FREE_FEATURES.map((feature) => <p key={feature}>✓ {feature}</p>)}
          </CardContent>
        </Card>
        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Pro</h2>
              {isPro ? <Badge>Active</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">More room to build your training system.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {PRO_FEATURES.map((feature) => <p key={feature}>✓ {feature}</p>)}
          </CardContent>
        </Card>
      </div>

      {isPro && subscription ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Pro</Badge>
              <Badge variant="outline">{getFriendlySubscriptionPlan(subscription.plan)}</Badge>
              <Badge variant="outline">{getFriendlySubscriptionStatus(subscription.status)}</Badge>
            </div>
            <h2 className="text-2xl font-bold">Your Pro access</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.lifetimePurchasedAt ? (
              <p className="text-sm text-muted-foreground">
                Paid once — no renewal.
              </p>
            ) : subscription.currentPeriodEnd ? (
              <p className="text-sm text-muted-foreground">
                Current period ends {subscription.currentPeriodEnd.toLocaleDateString("en-GB")}.
              </p>
            ) : null}
            {!subscription.lifetimePurchasedAt && subscription.cancelAtPeriodEnd ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Your subscription is set to cancel at the end of the current period.
              </p>
            ) : null}
            {subscription.lifetimePurchasedAt ? null : (
              <>
                <p className="text-sm text-muted-foreground">
                  To purchase Lifetime Pro without double billing, end your recurring
                  subscription and wait for its current access period to finish.
                </p>
                <ManageSubscriptionButton />
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-2xl font-bold">Choose your plan</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="font-semibold">Monthly</p>
                <p className="text-3xl font-bold">€4.99 <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="font-semibold">Yearly</p>
                <p className="text-3xl font-bold">€39.99 <span className="text-sm font-normal text-muted-foreground">/ year</span></p>
                <p className="mt-1 text-xs text-muted-foreground">Save €19.89 per year (about 33%) versus monthly.</p>
              </div>
              <div className="rounded-xl border border-primary/50 bg-primary/5 p-4">
                <Badge className="mb-2" variant="secondary">
                  Founding lifetime offer
                </Badge>
                <p className="font-semibold">Lifetime</p>
                <p className="text-3xl font-bold">
                  €79.99 {" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    once
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paid once — no renewal.
                </p>
              </div>
            </div>
            <CheckoutButtons />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
