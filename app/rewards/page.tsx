import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Coins,
  Crown,
  Dumbbell,
  Gift,
  Handshake,
  HeartHandshake,
  LockKeyhole,
  Sparkles,
  Store,
} from "lucide-react";
import { auth } from "@/auth";
import {
  PremiumEyebrow,
  PremiumSectionHeading,
} from "@/components/layout/PremiumPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUserEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rewards",
  description:
    "Preview the future Calistheni Pro rewards program and Calis Points.",
  alternates: { canonical: "/rewards" },
};

const rewardSteps = [
  {
    title: "Complete eligible activity",
    description: "Future earning rules will recognize qualifying actions.",
    icon: Dumbbell,
  },
  {
    title: "Earn Calis Points",
    description: "Eligible activity will build your points balance.",
    icon: Coins,
  },
  {
    title: "Unlock rewards",
    description: "Available partner offers will show their points cost.",
    icon: Gift,
  },
  {
    title: "Redeem with partners",
    description: "Launch campaigns will define the redemption flow.",
    icon: Store,
  },
];

const proBenefits = [
  {
    title: "Earn from eligible activity",
    description: "Planned for Pro members when points earning launches.",
    icon: Sparkles,
  },
  {
    title: "Access partner rewards",
    description: "Discover useful offers when redemption becomes available.",
    icon: Crown,
  },
  {
    title: "Support Calistheni growth",
    description: "Help fund better training, park, and community tools.",
    icon: HeartHandshake,
  },
];

export default async function RewardsPage() {
  const session = await auth();
  const [user, rewards, entitlementResult] = await Promise.all([
    session?.user?.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { rewardPoints: true },
        })
      : null,
    prisma.reward.findMany({
      where: { active: true },
      orderBy: [{ pointsCost: "asc" }, { title: "asc" }],
      take: 3,
    }),
    session?.user?.id
      ? getUserEntitlements(session.user.id)
      : Promise.resolve(null),
  ]);
  const rewardPoints = user?.rewardPoints ?? 0;
  const canEarnRewardPoints =
    entitlementResult?.entitlements.canEarnRewardPoints ?? false;
  const membershipLabel = session?.user
    ? canEarnRewardPoints
      ? "Pro eligible"
      : "Upgrade required"
    : "Sign in to check";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <section className="relative isolate pb-16 sm:pb-20 lg:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] lg:gap-20">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <PremiumEyebrow>Calis Points</PremiumEyebrow>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
            <h1 className="mt-5 text-5xl leading-[0.98] font-bold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Train. Earn.
              <span className="block text-primary">Unlock.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Calis Points will turn eligible training and community activity
              into access to partner rewards.
            </p>
            <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Earning and redemption are not active yet.
            </p>
            {!session?.user ? (
              <div className="mt-8 flex flex-col gap-3 min-[360px]:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">Sign in to view points</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/pro">Explore Pro</Link>
                </Button>
              </div>
            ) : null}
          </div>

          <div className="relative isolate mx-auto w-full max-w-md">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-[44%] left-1/2 -z-20 h-[112%] w-[106%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.22)_0%,rgba(59,130,246,0.1)_42%,transparent_72%)] blur-2xl sm:w-[118%]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-[8%] right-[10%] -z-10 h-1/2 w-1/2 rounded-full bg-primary/10 blur-3xl"
            />
            <div className="relative z-10 rotate-[1.5deg] rounded-3xl border border-primary/25 bg-card p-6 shadow-2xl shadow-black/20 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current balance</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Coins className="size-6 text-primary" aria-hidden="true" />
                    <p className="text-4xl font-bold tabular-nums sm:text-5xl">
                      {rewardPoints.toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Calis Points</p>
                </div>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Gift className="size-5" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-7 rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Reward preview
                  </span>
                  <LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-4 font-semibold">Partner rewards are preparing.</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Offers will appear here when partner campaigns launch.
                </p>
                <div className="mt-4 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  No live milestone is configured yet
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-16 sm:space-y-20 lg:space-y-24">
        <section aria-labelledby="points-overview-heading">
          <PremiumSectionHeading
            id="points-overview-heading"
            eyebrow="Your status"
            title="Points overview"
          />
          <Card className="rounded-2xl border-border/80 bg-card/80 py-0 shadow-none">
            <CardContent className="grid p-0 sm:grid-cols-3">
              <PointStatus
                label="Current points"
                value={rewardPoints.toLocaleString()}
                detail="Stored balance"
              />
              <PointStatus
                label="Earning status"
                value="Not active"
                detail="Launching later"
                bordered
              />
              <PointStatus
                label="Membership"
                value={membershipLabel}
                detail={
                  canEarnRewardPoints
                    ? "Eligible when earning launches"
                    : "Pro is planned for point earning"
                }
                bordered
              />
            </CardContent>
          </Card>
          <p className="mt-4 text-sm text-muted-foreground">
            Rewards will appear here when partner campaigns launch.
          </p>
        </section>

        <section aria-labelledby="reward-previews-heading">
          <PremiumSectionHeading
            id="reward-previews-heading"
            eyebrow="A look ahead"
            title="Featured reward previews"
            description="Examples of how configured rewards may appear when the program launches."
          />
          {rewards.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {rewards.map((reward, index) => (
                <article
                  key={reward.id}
                  className={`overflow-hidden rounded-2xl border border-border/80 bg-card/70 ${index === 0 ? "lg:-translate-y-2 lg:border-primary/30" : ""}`}
                >
                  <div
                    className="relative aspect-[16/9] overflow-hidden bg-[radial-gradient(circle_at_30%_20%,var(--color-primary),transparent_52%)] bg-primary/5"
                    style={
                      reward.imageUrl
                        ? {
                            backgroundImage: `linear-gradient(to top, color-mix(in oklab, var(--color-background) 72%, transparent), transparent), url("${reward.imageUrl}")`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          }
                        : undefined
                    }
                  >
                    <span className="absolute top-4 left-4 rounded-full border bg-background/90 px-3 py-1 text-xs font-semibold">
                      Preview
                    </span>
                    <LockKeyhole className="absolute right-4 bottom-4 size-5 text-foreground/70" aria-hidden="true" />
                  </div>
                  <div className="p-5 sm:p-6">
                    <p className="text-sm font-medium text-primary">
                      {reward.partnerName}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">{reward.title}</h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {reward.description}
                    </p>
                    <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
                      <span className="flex items-center gap-2 font-semibold tabular-nums">
                        <Coins className="size-4 text-primary" aria-hidden="true" />
                        {reward.pointsCost.toLocaleString()} points
                      </span>
                      <span className="text-xs text-muted-foreground">Unavailable</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <Gift className="mx-auto size-6 text-primary" aria-hidden="true" />
              <p className="mt-4 font-semibold">Reward previews are being prepared.</p>
              <p className="mt-2 text-sm text-muted-foreground">Check back as partner campaigns develop.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="rewards-flow-heading">
          <PremiumSectionHeading
            id="rewards-flow-heading"
            eyebrow="Planned experience"
            title="How rewards will work"
          />
          <div className="grid gap-3 md:grid-cols-4 md:gap-0">
            {rewardSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="relative rounded-2xl border bg-card/60 p-5 md:rounded-none md:border-y md:border-r-0 md:bg-transparent md:first:rounded-l-2xl md:first:border-l md:last:rounded-r-2xl md:last:border-r"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {step.description}
                  </p>
                  {index < rewardSteps.length - 1 ? (
                    <ArrowRight className="absolute top-8 -right-2.5 z-10 hidden size-5 rounded-full bg-background text-primary md:block" aria-hidden="true" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="pro-reward-heading">
          <PremiumSectionHeading
            id="pro-reward-heading"
            eyebrow="Future Pro value"
            title="Pro reward benefits"
            description="Planned for Pro members when earning and redemption launch."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {proBenefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div key={benefit.title} className="border-t border-border/80 pt-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>
              );
            })}
          </div>
          {!canEarnRewardPoints && session?.user ? (
            <Button asChild className="mt-8">
              <Link href="/pro">Explore Pro</Link>
            </Button>
          ) : null}
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8 lg:p-10">
          <div className="absolute right-0 bottom-0 size-64 translate-x-1/3 translate-y-1/3 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <PremiumEyebrow>Partner with Calistheni</PremiumEyebrow>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Are you a fitness or wellness brand?
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Explore how your offer could become a Calistheni reward.
              </p>
            </div>
            <Button asChild size="lg" className="w-full md:w-auto">
              <Link href="/partners">
                <Handshake className="size-4" /> Become a partner
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function PointStatus({
  label,
  value,
  detail,
  bordered = false,
}: {
  label: string;
  value: string;
  detail: string;
  bordered?: boolean;
}) {
  return (
    <div className={`p-5 sm:p-7 ${bordered ? "border-t sm:border-t-0 sm:border-l" : ""}`}>
      <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
