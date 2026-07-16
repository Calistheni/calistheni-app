import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Crown,
  Dumbbell,
  Gift,
  Handshake,
  InfinityIcon,
  LibraryBig,
  X,
} from "lucide-react";
import { auth } from "@/auth";
import { CheckoutButtons } from "@/components/billing/CheckoutButtons";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import {
  PremiumEyebrow,
  PremiumSectionHeading,
} from "@/components/layout/PremiumPage";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getFriendlySubscriptionPlan,
  getFriendlySubscriptionStatus,
  getUserEntitlements,
  hasOngoingRecurringSubscription,
} from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Calistheni Pro",
  description: "Compare Calistheni Free and Pro plans.",
};

const comparisonRows = [
  { label: "Workout logging", free: "Unlimited", pro: "Unlimited" },
  { label: "Saved routines", free: "Up to 4", pro: "Unlimited" },
  { label: "Custom exercises", free: "Up to 7", pro: "Unlimited" },
  { label: "Exercise library", free: "Included", pro: "Included" },
  { label: "Parks and Community", free: "Included", pro: "Included" },
  { label: "Calis Points eligibility", free: false, pro: "Planned" },
  { label: "Expanded progress history", free: false, pro: "Planned" },
  { label: "Future advanced Pro features", free: false, pro: "Planned" },
];

const proValues = [
  {
    title: "More room to build routines",
    description: "Create as many saved training plans as your program needs.",
    icon: LibraryBig,
  },
  {
    title: "More custom exercise flexibility",
    description: "Track movements that are specific to your own training.",
    icon: Dumbbell,
  },
  {
    title: "Future rewards and progress benefits",
    description: "Be eligible for planned Calis Points and expanded progress tools.",
    icon: Gift,
  },
];

const faqs = [
  {
    question: "Can I cancel monthly or yearly Pro?",
    answer:
      "Yes. Recurring Pro subscriptions can be managed through the Stripe billing portal.",
  },
  {
    question: "What happens after cancellation?",
    answer:
      "If cancellation is scheduled for period end, Pro access remains available until the current paid period ends.",
  },
  {
    question: "How does Lifetime Pro work?",
    answer:
      "Lifetime Pro is paid once with no renewal. An active recurring subscription must finish before Lifetime can be purchased to avoid double billing.",
  },
  {
    question: "Are rewards live yet?",
    answer:
      "No. Calis Points earning and partner reward redemption are planned but are not active yet.",
  },
];

export default async function ProPage() {
  const session = await auth();
  const result = session?.user?.id
    ? await getUserEntitlements(session.user.id)
    : null;
  const subscription = result?.subscription ?? null;
  const isPro = result?.entitlements.isPro ?? false;
  const currentPlan =
    isPro && subscription && subscription.plan !== "FREE"
      ? subscription.plan
      : null;
  const hasRecurringSubscription = hasOngoingRecurringSubscription(subscription);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <section className="relative overflow-hidden pb-16 text-center sm:pb-20 lg:pb-24">
        <div className="absolute top-1/2 left-1/2 -z-10 h-80 w-[44rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex justify-center">
          <PremiumEyebrow>Calistheni Pro</PremiumEyebrow>
        </div>
        <h1 className="mx-auto mt-5 max-w-4xl text-5xl leading-[0.98] font-bold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
          Train without <span className="text-primary">limits.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Keep every core training tool on Free, or unlock higher limits and
          future Pro benefits.
        </p>
        {isPro ? (
          <div className="mt-7 flex justify-center">
            <Badge className="gap-2 px-3 py-1.5">
              <Crown className="size-3.5" aria-hidden="true" />
              {subscription?.lifetimePurchasedAt
                ? "Lifetime Pro · Paid once — no renewal"
                : `${getFriendlySubscriptionPlan(subscription?.plan ?? "FREE")} active`}
            </Badge>
          </div>
        ) : null}
      </section>

      <div className="space-y-16 sm:space-y-20 lg:space-y-24">
        <section aria-labelledby="pricing-options-heading">
          <PremiumSectionHeading
            id="pricing-options-heading"
            eyebrow="Choose your access"
            title="Pricing options"
            description="Three ways to unlock the same Pro access. Recurring plans are managed securely through Stripe."
          />
          <CheckoutButtons
            isPro={isPro}
            currentPlan={currentPlan}
            hasRecurringSubscription={hasRecurringSubscription}
          />
        </section>

        <section aria-labelledby="comparison-heading">
          <PremiumSectionHeading
            id="comparison-heading"
            eyebrow="Clear by design"
            title="Free and Pro compared"
            description="Core training stays useful on Free. Pro removes creation limits and adds eligibility for planned benefits."
          />
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/60">
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] border-b bg-muted/20 px-4 py-4 text-xs font-semibold tracking-wide uppercase sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:px-6">
              <span>Feature</span>
              <span className="text-center">Free</span>
              <span className="text-center text-primary">Pro</span>
            </div>
            {comparisonRows.map((row) => (
              <div
                key={row.label}
                className="grid min-h-16 grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:px-6"
              >
                <p className="pr-3 text-sm font-medium sm:text-base">{row.label}</p>
                <ComparisonValue value={row.free} />
                <ComparisonValue value={row.pro} pro />
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="subscription-heading">
          <PremiumSectionHeading
            id="subscription-heading"
            eyebrow="Your account"
            title="Current subscription"
          />
          <Card className="rounded-2xl border-border/80 bg-card/75 shadow-none">
            <CardContent className="flex flex-col gap-6 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
              {isPro && subscription ? (
                <>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Pro</Badge>
                      <Badge variant="outline">
                        {getFriendlySubscriptionPlan(subscription.plan)}
                      </Badge>
                      <Badge variant="outline">
                        {getFriendlySubscriptionStatus(subscription.status)}
                      </Badge>
                    </div>
                    <h3 className="mt-5 text-2xl font-bold">
                      {subscription.lifetimePurchasedAt
                        ? "Lifetime Pro · Paid once — no renewal"
                        : "Your Pro access is active"}
                    </h3>
                    {subscription.lifetimePurchasedAt ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        There is no recurring subscription or renewal date.
                      </p>
                    ) : subscription.currentPeriodEnd ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {subscription.cancelAtPeriodEnd
                          ? `Access remains active until ${subscription.currentPeriodEnd.toLocaleDateString("en-GB")}.`
                          : `Current period ends ${subscription.currentPeriodEnd.toLocaleDateString("en-GB")}.`}
                      </p>
                    ) : null}
                    {!subscription.lifetimePurchasedAt && subscription.cancelAtPeriodEnd ? (
                      <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                        Cancellation is scheduled for the end of the current period.
                      </p>
                    ) : null}
                  </div>
                  {subscription.lifetimePurchasedAt ? (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <InfinityIcon className="size-6" aria-hidden="true" />
                    </span>
                  ) : (
                    <ManageSubscriptionButton variant="outline" />
                  )}
                </>
              ) : (
                <>
                  <div>
                    <Badge variant="secondary">
                      {session?.user ? "Free" : "Account"}
                    </Badge>
                    <h3 className="mt-5 text-2xl font-bold">
                      {session?.user
                        ? "You are on Calistheni Free."
                        : "Sign in to view your current plan."}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {session?.user
                        ? "Core workout logging, the exercise library, parks, and community remain available."
                        : "Your subscription status and billing controls will appear here after sign-in."}
                    </p>
                  </div>
                  {session?.user ? (
                    <Button asChild variant="outline">
                      <Link href="#pricing-options-heading">Choose Pro</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline">
                      <Link href="/login">Sign in</Link>
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="why-pro-heading">
          <PremiumSectionHeading
            id="why-pro-heading"
            eyebrow="Built for deeper training"
            title="Why Pro"
          />
          <div className="grid gap-5 md:grid-cols-3">
            {proValues.map((value) => {
              const Icon = value.icon;
              return (
                <div key={value.title} className="border-t border-border/80 pt-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{value.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="pricing-faq-heading" className="mx-auto w-full max-w-4xl">
          <PremiumSectionHeading
            id="pricing-faq-heading"
            eyebrow="The essentials"
            title="Common questions"
          />
          <Accordion type="single" collapsible className="rounded-2xl border border-border/80 px-5 sm:px-6">
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`pricing-faq-${index}`}>
                <AccordionTrigger className="py-5 text-base hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-2xl pb-5 leading-6 text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8 lg:p-10">
          <div className="absolute right-0 bottom-0 size-64 translate-x-1/3 translate-y-1/3 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
            <div>
              <PremiumEyebrow>For businesses</PremiumEyebrow>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Represent a fitness or wellness business?
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                See how a useful offer could become part of Calistheni rewards.
              </p>
            </div>
            <Button asChild size="lg" variant="outline" className="w-full md:w-auto">
              <Link href="/partners">
                <Handshake className="size-4" /> Explore partnerships
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ComparisonValue({
  value,
  pro = false,
}: {
  value: string | boolean;
  pro?: boolean;
}) {
  if (value === false) {
    return (
      <span className="flex justify-center text-muted-foreground" aria-label="Not included">
        <X className="size-4" aria-hidden="true" />
      </span>
    );
  }

  if (value === true) {
    return (
      <span className={`flex justify-center ${pro ? "text-primary" : ""}`} aria-label="Included">
        <Check className="size-4" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={`px-1 text-center text-xs font-medium sm:text-sm ${pro ? "text-primary" : "text-muted-foreground"}`}>
      {value}
    </span>
  );
}
