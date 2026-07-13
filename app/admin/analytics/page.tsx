import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAnalyticsPeriods } from "@/lib/analytics-dates";
import { publicParkWhere } from "@/lib/parks";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Admin Analytics",
  robots: {
    index: false,
    follow: false,
  },
};

type MetricCardProps = {
  label: string;
  value: number | string;
  description?: string;
};

function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

async function getActiveUserCount(since: Date) {
  // MVP active user definition:
  // A user is active if they performed at least one meaningful stored action
  // since the period start: created a workout, created a routine, submitted a
  // park/edit, or followed another user.
  const [workouts, routines, submittedParks, parkEdits, follows] =
    await Promise.all([
      prisma.workout.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          userId: true,
        },
        distinct: ["userId"],
      }),
      prisma.workoutTemplate.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          userId: true,
        },
        distinct: ["userId"],
      }),
      prisma.park.findMany({
        where: {
          createdAt: {
            gte: since,
          },
          submittedById: {
            not: null,
          },
        },
        select: {
          submittedById: true,
        },
        distinct: ["submittedById"],
      }),
      prisma.parkEditSubmission.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          submittedById: true,
        },
        distinct: ["submittedById"],
      }),
      prisma.userFollow.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          followerId: true,
        },
        distinct: ["followerId"],
      }),
    ]);

  return new Set([
    ...workouts.map((item) => item.userId),
    ...routines.map((item) => item.userId),
    ...submittedParks
      .map((item) => item.submittedById)
      .filter((userId): userId is string => Boolean(userId)),
    ...parkEdits.map((item) => item.submittedById),
    ...follows.map((item) => item.followerId),
  ]).size;
}

export default async function AdminAnalyticsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const { today, last7Days, last30Days } = getAnalyticsPeriods();
  const [
    totalUsers,
    newUsersToday,
    newUsersLast7,
    newUsersLast30,
    dau,
    wau,
    mau,
    workoutsToday,
    workoutsLast7,
    workoutsLast30,
    totalRoutines,
    routinesLast30,
    totalPublicParks,
    pendingNewParks,
    pendingParkEdits,
    approvedNewParksLast30,
    approvedParkEditsLast30,
    rejectedNewParksLast30,
    rejectedParkEditsLast30,
    totalFollows,
    followsLast30,
    rewardPointsAggregate,
    rewardTransactionCount,
    redemptionCount,
    onboardingCompletedCount,
    proUsers,
    monthlyProUsers,
    yearlyProUsers,
    lifetimeProUsers,
    cancelAtPeriodEndCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: last7Days } } }),
    prisma.user.count({ where: { createdAt: { gte: last30Days } } }),
    getActiveUserCount(today),
    getActiveUserCount(last7Days),
    getActiveUserCount(last30Days),
    prisma.workout.count({ where: { createdAt: { gte: today } } }),
    prisma.workout.count({ where: { createdAt: { gte: last7Days } } }),
    prisma.workout.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.workoutTemplate.count(),
    prisma.workoutTemplate.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.park.count({ where: publicParkWhere }),
    prisma.park.count({
      where: {
        submissionStatus: "PENDING",
        submittedById: {
          not: null,
        },
      },
    }),
    prisma.parkEditSubmission.count({ where: { status: "PENDING" } }),
    prisma.park.count({
      where: {
        submissionStatus: "APPROVED",
        submittedById: {
          not: null,
        },
        reviewedAt: {
          gte: last30Days,
        },
      },
    }),
    prisma.parkEditSubmission.count({
      where: {
        status: "APPROVED",
        reviewedAt: {
          gte: last30Days,
        },
      },
    }),
    prisma.park.count({
      where: {
        submissionStatus: "REJECTED",
        submittedById: {
          not: null,
        },
        reviewedAt: {
          gte: last30Days,
        },
      },
    }),
    prisma.parkEditSubmission.count({
      where: {
        status: "REJECTED",
        reviewedAt: {
          gte: last30Days,
        },
      },
    }),
    prisma.userFollow.count(),
    prisma.userFollow.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.user.aggregate({ _sum: { rewardPoints: true } }),
    prisma.rewardTransaction.count(),
    prisma.rewardRedemption.count(),
    prisma.user.count({ where: { onboardingCompleted: true } }),
    prisma.subscription.count({
      where: {
        plan: { in: ["PRO_MONTHLY", "PRO_YEARLY"] },
        status: { in: ["ACTIVE", "TRIALING"] },
      },
    }),
    prisma.subscription.count({
      where: { plan: "PRO_MONTHLY", status: { in: ["ACTIVE", "TRIALING"] } },
    }),
    prisma.subscription.count({
      where: { plan: "PRO_YEARLY", status: { in: ["ACTIVE", "TRIALING"] } },
    }),
    prisma.subscription.count({
      where: { lifetimePurchasedAt: { not: null } },
    }),
    prisma.subscription.count({
      where: {
        plan: { in: ["PRO_MONTHLY", "PRO_YEARLY"] },
        status: { in: ["ACTIVE", "TRIALING"] },
        cancelAtPeriodEnd: true,
      },
    }),
  ]);

  const onboardingCompletionPercent =
    totalUsers > 0 ? (onboardingCompletedCount / totalUsers) * 100 : 0;
  const pendingParkSubmissions = pendingNewParks + pendingParkEdits;
  const approvedParkSubmissionsLast30 =
    approvedNewParksLast30 + approvedParkEditsLast30;
  const rejectedParkSubmissionsLast30 =
    rejectedNewParksLast30 + rejectedParkEditsLast30;
  const averageWorkoutsPerActiveUserLast30 =
    mau > 0 ? workoutsLast30 / mau : 0;
  const totalProUsers = proUsers + lifetimeProUsers;
  const freeUsers = totalUsers - totalProUsers;
  const freeToProConversion =
    totalUsers > 0 ? (totalProUsers / totalUsers) * 100 : 0;
  const estimatedMrr = monthlyProUsers * 4.99 + yearlyProUsers * (39.99 / 12);
  const estimatedLifetimeGrossSales = lifetimeProUsers * 79.99;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/admin" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Internal product usage signals before marketing and Pro launch.
          </p>
        </div>
        <Badge variant="outline">Admin only</Badge>
      </div>

      <section className="mb-8 space-y-4">
        <h2 className="text-xl font-semibold">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total users" value={formatNumber(totalUsers)} />
          <MetricCard label="DAU" value={formatNumber(dau)} />
          <MetricCard label="WAU" value={formatNumber(wau)} />
          <MetricCard label="MAU" value={formatNumber(mau)} />
        </div>
      </section>

      <section className="mb-8 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            Local webhook-synced state. Estimated MRR is a product metric, not
            financial or accounting revenue truth.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Pro users" value={formatNumber(totalProUsers)} />
          <MetricCard label="Free users" value={formatNumber(freeUsers)} />
          <MetricCard
            label="Free → Pro conversion"
            value={formatPercent(freeToProConversion)}
          />
          <MetricCard label="Monthly Pro users" value={formatNumber(monthlyProUsers)} />
          <MetricCard label="Yearly Pro users" value={formatNumber(yearlyProUsers)} />
          <MetricCard label="Lifetime Pro users" value={formatNumber(lifetimeProUsers)} />
          <MetricCard
            label="Lifetime purchases"
            value={formatNumber(lifetimeProUsers)}
          />
          <MetricCard
            label="Estimated lifetime gross sales"
            value={new Intl.NumberFormat("en", {
              style: "currency",
              currency: "EUR",
            }).format(estimatedLifetimeGrossSales)}
            description="Locally synchronized successful purchases × €79.99. Excluded from MRR."
          />
          <MetricCard
            label="Cancel at period end"
            value={formatNumber(cancelAtPeriodEndCount)}
          />
          <MetricCard
            label="Estimated MRR"
            value={new Intl.NumberFormat("en", {
              style: "currency",
              currency: "EUR",
            }).format(estimatedMrr)}
            description="€4.99 monthly + €39.99 / 12 yearly; active/trialing only."
          />
        </div>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Users</h2>
            <p className="text-sm text-muted-foreground">
              User counts use the app database. Existing accounts were
              backfilled when onboarding launched.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["New users today", newUsersToday],
                  ["New users last 7 days", newUsersLast7],
                  ["New users last 30 days", newUsersLast30],
                  ["Onboarding completed", onboardingCompletedCount],
                ].map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(Number(value))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>Onboarding completion</TableCell>
                  <TableCell className="text-right">
                    {formatPercent(onboardingCompletionPercent)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Workouts</h2>
            <p className="text-sm text-muted-foreground">
              Workout usage and consistency over the latest periods.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Workouts today", workoutsToday],
                  ["Workouts last 7 days", workoutsLast7],
                  ["Workouts last 30 days", workoutsLast30],
                ].map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(Number(value))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>Avg workouts / active user, 30d</TableCell>
                  <TableCell className="text-right">
                    {averageWorkoutsPerActiveUserLast30.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Parks</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {[
                  ["Total public parks", totalPublicParks],
                  ["Pending park submissions", pendingParkSubmissions],
                  ["Approved submissions, 30d", approvedParkSubmissionsLast30],
                  ["Rejected submissions, 30d", rejectedParkSubmissionsLast30],
                ].map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(Number(value))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Social</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Total follows</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(totalFollows)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>New follows, 30d</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(followsLast30)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Routines</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Total routines</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(totalRoutines)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Created last 30 days</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(routinesLast30)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Rewards</h2>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Total reward points</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(rewardPointsAggregate._sum.rewardPoints ?? 0)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Reward transactions</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(rewardTransactionCount)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Redemptions</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(redemptionCount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

    </main>
  );
}
