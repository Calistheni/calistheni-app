import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { BodyweightForm } from "@/components/profile/BodyweightForm";
import { CardioGoalCard } from "@/components/profile/CardioGoalCard";
import { MobileAccountUtilities } from "@/components/profile/MobileAccountUtilities";
import { ProfileStatCard } from "@/components/profile/ProfileStatCard";
import { SocialConnections } from "@/components/social/SocialConnections";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import {
  MuscleActivityRadar,
  type MuscleActivityPoint,
} from "@/components/profile/MuscleActivityRadar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatPersonalRecordValue,
  PERSONAL_RECORD_LABELS,
  type PersonalRecordType,
} from "@/lib/personal-records";
import { aggregateMuscleActivity } from "@/lib/muscle-activity";
import { getWeeklyCardioProgress } from "@/lib/cardio-service";
import { formatDateOfBirth } from "@/lib/date-of-birth";
import { prisma } from "@/lib/prisma";
import {
  getFriendlySubscriptionPlan,
  getUserEntitlements,
} from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Profile",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    workoutCount,
    workoutSets,
    submittedParkCount,
    approvedEditCount,
    approvedPhotoCount,
    profile,
    recentPersonalRecords,
    recentMuscleSets,
    entitlementResult,
    cardioProgress,
  ] = await Promise.all([
    prisma.workout.count({
      where: {
        userId: session.user.id,
      },
    }),
    prisma.workoutSet.count({
      where: {
        completed: true,
        workoutExercise: {
          workout: {
            userId: session.user.id,
          },
        },
      },
    }),
    prisma.park.count({
      where: {
        submittedById: session.user.id,
      },
    }),
    prisma.parkEditSubmission.count({
      where: {
        submittedById: session.user.id,
        status: "APPROVED",
      },
    }),
    prisma.parkPhoto.count({
      where: {
        uploadedById: session.user.id,
        park: {
          submissionStatus: "APPROVED",
          deletedAt: null,
        },
      },
    }),
    prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        bodyweightKg: true,
        dateOfBirth: true,
        rpeTrackingEnabled: true,
        rewardPoints: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    }),
    prisma.personalRecord.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        achievedAt: "desc",
      },
      take: 30,
      include: {
        exercise: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.workoutSet.findMany({
      where: {
        completed: true,
        workoutExercise: {
          workout: {
            userId: session.user.id,
            completedAt: {
              gte: thirtyDaysAgo,
            },
          },
        },
      },
      select: {
        id: true,
        workoutExercise: {
          select: {
            exercise: {
              select: {
                muscle: true,
                secondaryMuscles: true,
              },
            },
          },
        },
      },
    }),
    getUserEntitlements(session.user.id),
    getWeeklyCardioProgress(session.user.id).catch((error) => {
      console.error("CARDIO_PROGRESS_FAILED", {
        userId: session.user.id,
        route: "/profile",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }),
  ]);
  const { entitlements, subscription } = entitlementResult;
  const muscleActivity: MuscleActivityPoint[] = aggregateMuscleActivity(
    recentMuscleSets.map((set) => ({
      aggregationId: set.id,
      primaryMuscle: set.workoutExercise.exercise.muscle,
      secondaryMuscles: set.workoutExercise.exercise.secondaryMuscles,
    }))
  );
  const recentRecordExercises = recentPersonalRecords
    .filter(
      (record, index, records) =>
        records.findIndex((item) => item.exerciseId === record.exerciseId) ===
        index
    )
    .slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <Card className="mb-6">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt=""
              width={72}
              height={72}
              unoptimized
              className="h-16 w-16 rounded-full bg-muted object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-bold">
              {(session.user.name ?? "U").slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-bold">
              {session.user.name ?? "Profile"}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {session.user.email ?? "Signed in user"}
            </p>
            <SocialConnections
              profileUserId={session.user.id}
              viewerUserId={session.user.id}
              initialFollowerCount={profile?._count.followers ?? 0}
              initialFollowingCount={profile?._count.following ?? 0}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={entitlements.isPro ? "default" : "secondary"}>
                {entitlements.isPro ? "Pro" : "Free"}
              </Badge>
              {entitlements.isPro && subscription ? (
                <Badge variant="outline">
                  {getFriendlySubscriptionPlan(subscription.plan)}
                </Badge>
              ) : null}
              <Badge variant="outline">Workout tracker</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {subscription?.lifetimePurchasedAt ? (
                <p className="text-sm text-muted-foreground">
                  Lifetime Pro · Paid once — no renewal
                </p>
              ) : entitlements.isPro && subscription?.stripeCustomerId ? (
                <ManageSubscriptionButton variant="outline" />
              ) : (
                <Button asChild>
                  <Link href="/pro">Upgrade to Pro</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/users/${session.user.id}`}>Public Profile</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Workouts", workoutCount],
          ["Sets", workoutSets],
          ["Parks", submittedParkCount],
          ["Approved edits", approvedEditCount],
          ["Approved photos", approvedPhotoCount],
          ["Reward Points", profile?.rewardPoints ?? 0],
        ].map(([label, value]) => (
          <ProfileStatCard key={label} label={String(label)} value={value} />
        ))}
      </div>

      <section
        aria-label="Training analytics"
        className="mb-6 grid items-stretch gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]"
      >
        <MuscleActivityRadar data={muscleActivity} />
        <CardioGoalCard initialProgress={cardioProgress} />
      </section>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-2xl font-bold">Rewards</h2>
          <p className="text-sm text-muted-foreground">
            {entitlements.canEarnRewardPoints
              ? "You'll be eligible to earn Calis Points when earning rules launch."
              : "Upgrade to Pro to start earning Calis Points when earning rules launch."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/rewards">View Rewards</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Recent PRs</h2>
              <p className="text-sm text-muted-foreground">
                Your latest personal records from logged workouts.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/profile/records">View All PRs</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentRecordExercises.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              Complete workout sets to start collecting personal records.
            </p>
          ) : (
            <div className="grid gap-3">
              {recentRecordExercises.map((record) => (
                <Link
                  key={record.exerciseId}
                  href={`/profile/records/${encodeURIComponent(record.exercise.id)}`}
                  className="rounded-xl border bg-muted/20 p-4 transition hover:border-primary/50"
                  aria-label={`View all records for ${record.exercise.name}`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{record.exercise.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {
                          PERSONAL_RECORD_LABELS[
                            record.type as PersonalRecordType
                          ]
                        }
                      </p>
                    </div>
                    <p className="text-lg font-bold">
                      {formatPersonalRecordValue(
                        record.type as PersonalRecordType,
                        record.value
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-2xl font-bold">Personal details</h2>
          <p className="text-sm text-muted-foreground">
            Private details used to personalize your training calculations.
          </p>
        </CardHeader>
        <CardContent>
          <BodyweightForm
            initialBodyweightKg={profile?.bodyweightKg ?? null}
            initialDateOfBirth={formatDateOfBirth(profile?.dateOfBirth)}
            initialRpeTrackingEnabled={profile?.rpeTrackingEnabled ?? false}
          />
        </CardContent>
      </Card>

      <Card className="mb-6 md:hidden">
        <CardHeader>
          <h2 className="text-2xl font-bold">Account settings</h2>
          <p className="text-sm text-muted-foreground">
            Appearance and sign-in controls for this account.
          </p>
        </CardHeader>
        <CardContent>
          <MobileAccountUtilities />
        </CardContent>
      </Card>

    </main>
  );
}
