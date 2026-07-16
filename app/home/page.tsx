import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Dumbbell,
  ListChecks,
  MapPin,
  Medal,
  Scale,
  Target,
  Trophy,
  UsersRound,
} from "lucide-react";
import { auth } from "@/auth";
import {
  HomeContinueJourney,
  HomeWorkoutActions,
} from "@/components/home/HomeWorkoutOverview";
import { TrainingActivityCalendar } from "@/components/home/TrainingActivityCalendar";
import { WeeklyGoalEditor } from "@/components/home/WeeklyGoalEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  calculateCurrentWorkoutStreak,
  calculateFourWeekGoalConsistency,
  countCurrentWeekCompletedWorkouts,
  getUtcWeekStart,
  groupCompletedWorkoutActivity,
  toUtcDateKey,
} from "@/lib/home-dashboard";
import { aggregateMuscleActivity } from "@/lib/muscle-activity";
import { redirectIfOnboardingRequired } from "@/lib/onboarding";
import {
  formatPersonalRecordValue,
  PERSONAL_RECORD_LABELS,
  type PersonalRecordType,
} from "@/lib/personal-records";
import { prisma } from "@/lib/prisma";
import { getPersistedVolumeSetCompletion } from "@/lib/workout-volume";
import { mapWorkoutSummary } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

const workoutInclude = {
  user: {
    select: { id: true, name: true, image: true, bodyweightKg: true },
  },
  exercises: {
    orderBy: { order: "asc" as const },
    include: {
      exercise: true,
      sets: { orderBy: { order: "asc" as const } },
    },
  },
} as const;

function isCompletedSet(
  set: { completed: boolean },
  workoutUpdatedAt: Date
) {
  return (
    getPersistedVolumeSetCompletion({
      completed: set.completed,
      workoutUpdatedAt,
    }) !== false
  );
}

function completedSetCount(workout: {
  updatedAt: Date;
  exercises: Array<{ sets: Array<{ completed: boolean }> }>;
}) {
  return workout.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.filter((set) => isCompletedSet(set, workout.updatedAt))
        .length,
    0
  );
}

function formatDuration(startedAt: Date, completedAt: Date | null) {
  if (!completedAt) return null;
  const minutes = Math.max(
    1,
    Math.round((completedAt.getTime() - startedAt.getTime()) / 60_000)
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatHeroDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function formatVolume(
  workouts: Array<{ totalVolume: number | null }>,
  emptyLabel = "—"
) {
  if (workouts.length === 0) return emptyLabel;
  const available = workouts.flatMap((workout) =>
    workout.totalVolume === null ? [] : [workout.totalVolume]
  );
  if (available.length === 0) return "Unavailable";
  const total = available.reduce((sum, value) => sum + value, 0);
  return `${Math.round(total).toLocaleString()} kg${
    available.length < workouts.length ? " partial" : ""
  }`;
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={id}
          className={`${eyebrow ? "mt-2" : ""} text-2xl font-bold tracking-tight sm:text-3xl`}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await redirectIfOnboardingRequired(session.user.id);

  const now = new Date();
  const weekStart = getUtcWeekStart(now);
  const calendarStart = new Date(weekStart);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - 25 * 7);

  const [
    profile,
    weeklyWorkouts,
    calendarWorkouts,
    allCompletedDates,
    recentWorkout,
    routines,
    latestPersonalRecord,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        bodyweightKg: true,
        weeklyWorkoutGoal: true,
        createdAt: true,
      },
    }),
    prisma.workout.findMany({
      where: {
        userId: session.user.id,
        completedAt: { gte: weekStart },
      },
      orderBy: { completedAt: "desc" },
      include: workoutInclude,
    }),
    prisma.workout.findMany({
      where: {
        userId: session.user.id,
        completedAt: { gte: calendarStart },
      },
      orderBy: { completedAt: "asc" },
      include: workoutInclude,
    }),
    prisma.workout.findMany({
      where: { userId: session.user.id, completedAt: { not: null } },
      select: { completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.workout.findFirst({
      where: { userId: session.user.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      include: workoutInclude,
    }),
    prisma.workoutTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        _count: { select: { exercises: true } },
      },
    }),
    prisma.personalRecord.findFirst({
      where: { userId: session.user.id },
      orderBy: { achievedAt: "desc" },
      include: { exercise: { select: { name: true } } },
    }),
  ]);

  if (!profile) redirect("/login");

  const weeklySummaries = weeklyWorkouts.map(mapWorkoutSummary);
  const weeklyCompletedSets = weeklyWorkouts.reduce(
    (sum, workout) => sum + completedSetCount(workout),
    0
  );
  const weeklyWorkoutCount = countCurrentWeekCompletedWorkouts(
    weeklyWorkouts,
    now
  );
  const weeklyActiveDays = new Set(
    weeklyWorkouts.flatMap((workout) =>
      workout.completedAt ? [toUtcDateKey(workout.completedAt)] : []
    )
  ).size;
  const currentStreak = calculateCurrentWorkoutStreak(allCompletedDates, now);
  const calendarActivities = groupCompletedWorkoutActivity(
    calendarWorkouts.map((workout) => {
      const summary = mapWorkoutSummary(workout);
      return {
        completedAt: workout.completedAt,
        completedSets: completedSetCount(workout),
        totalVolumeKg: summary.totalVolume,
      };
    })
  );
  const consistency = calculateFourWeekGoalConsistency({
    workouts: allCompletedDates,
    weeklyGoal: profile.weeklyWorkoutGoal,
    now,
    historyStart: profile.createdAt,
  });
  const trainedMuscles = aggregateMuscleActivity(
    weeklyWorkouts.flatMap((workout) =>
      workout.exercises.flatMap((workoutExercise) =>
        workoutExercise.sets
          .filter((set) => isCompletedSet(set, workout.updatedAt))
          .map(() => ({
            primaryMuscle: workoutExercise.exercise.muscle,
            secondaryMuscles: workoutExercise.exercise.secondaryMuscles,
          }))
      )
    )
  );
  const mostTrainedMuscle = [...trainedMuscles].sort(
    (left, right) => right.sets - left.sets
  )[0];
  const recentSummary = recentWorkout ? mapWorkoutSummary(recentWorkout) : null;
  const recentCompletedSets = recentWorkout
    ? completedSetCount(recentWorkout)
    : 0;
  const firstName = profile.name?.trim().split(/\s+/)[0] ?? "athlete";

  const weekStats = [
    { label: "Workouts", value: weeklyWorkoutCount.toLocaleString() },
    { label: "Completed sets", value: weeklyCompletedSets.toLocaleString() },
    { label: "Volume", value: formatVolume(weeklySummaries) },
    { label: "Active days", value: weeklyActiveDays.toLocaleString() },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <header className="max-w-4xl pb-16 sm:pb-20 lg:pb-24">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {formatHeroDate(now)}
        </p>
        <h1 className="mt-5 text-4xl font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
          Welcome back, {firstName}.
        </h1>
        <div className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          <p>Keep your momentum going.</p>
          {currentStreak > 0 ? (
            <p className="mt-1 text-foreground">
              {currentStreak}-day streak — keep it moving.
            </p>
          ) : null}
        </div>
        <div className="mt-8">
          <HomeWorkoutActions />
        </div>
      </header>

      <div className="space-y-16 sm:space-y-20 lg:space-y-24">
        <section aria-labelledby="week-heading">
          <SectionHeading
            id="week-heading"
            eyebrow="Your momentum"
            title="This Week"
            description="Completed training from the current calendar week."
          />
          <Card className="rounded-2xl border-border/80 bg-card/80 py-0 shadow-none">
            <CardContent className="p-5 sm:p-7 lg:p-8">
              <div className="grid grid-cols-2 lg:grid-cols-4">
                {weekStats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className={`min-w-0 py-4 sm:px-6 sm:py-5 lg:px-8 ${
                      index % 2 === 1 ? "border-l" : ""
                    } ${index >= 2 ? "border-t" : ""} ${
                      index > 0 ? "lg:border-t-0" : ""
                    } ${index > 0 ? "lg:border-l" : "lg:border-l-0"}`}
                  >
                    <p className="text-[0.68rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase sm:text-xs">
                      {stat.label}
                    </p>
                    <p className="mt-2 break-words text-2xl font-bold tracking-tight tabular-nums sm:text-3xl lg:text-4xl">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
              <WeeklyGoalEditor
                initialGoal={profile.weeklyWorkoutGoal}
                completedWorkouts={weeklyWorkoutCount}
              />
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="activity-heading">
          <SectionHeading
            id="activity-heading"
            eyebrow="Consistency"
            title="Training activity"
            description="Your completed workouts over time."
          />
          <TrainingActivityCalendar
            activities={calendarActivities}
            todayKey={toUtcDateKey(now)}
          />
        </section>

        <HomeContinueJourney />

        <section aria-labelledby="routines-heading">
          <SectionHeading
            id="routines-heading"
            eyebrow="Ready when you are"
            title="Routines"
            description="Start from one of your recently updated training plans."
            action={
              <Button asChild variant="ghost" className="shrink-0">
                <Link href="/routines">
                  View all <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          {routines.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {routines.map((routine) => (
                <Card key={routine.id} className="rounded-2xl shadow-none">
                  <CardContent className="flex h-full flex-col p-5 sm:p-6">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ListChecks className="size-5" aria-hidden="true" />
                    </span>
                    <Link
                      href={`/routines/${routine.id}`}
                      className="mt-6 text-xl font-semibold hover:text-primary"
                    >
                      {routine.name}
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {routine._count.exercises} exercise{routine._count.exercises === 1 ? "" : "s"} · Updated {formatShortDate(routine.updatedAt)}
                    </p>
                    <Button asChild className="mt-7 w-full sm:w-fit">
                      <Link href={`/workouts/new?routineId=${routine.id}`}>
                        Start <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl shadow-none">
              <CardContent className="flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">Build your first routine</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save a repeatable session and start training faster next time.
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/routines/new">Create Routine</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-labelledby="recent-heading">
          <SectionHeading
            id="recent-heading"
            eyebrow="Latest session"
            title="Recent Activity"
          />
          <Card className="rounded-2xl shadow-none">
            <CardContent className="p-5 sm:p-6">
              {recentWorkout && recentSummary ? (
                <div className="flex flex-col gap-6 md:flex-row md:items-center">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Dumbbell className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-semibold">
                      {recentSummary.title ?? "Workout"}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatShortDate(recentWorkout.completedAt ?? recentWorkout.startedAt)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-y py-4 md:min-w-md md:border-y-0 md:border-l md:py-0 md:pl-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="mt-1 font-semibold tabular-nums">
                        {formatDuration(recentWorkout.startedAt, recentWorkout.completedAt) ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sets</p>
                      <p className="mt-1 font-semibold tabular-nums">{recentCompletedSets}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Volume</p>
                      <p className="mt-1 break-words font-semibold tabular-nums">
                        {recentSummary.totalVolume === null
                          ? "Unavailable"
                          : `${Math.round(recentSummary.totalVolume).toLocaleString()} kg`}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full md:w-auto">
                    <Link href={`/workouts/${recentSummary.id}`}>View</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold">Your completed workouts will appear here.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Finish a session to build your training history.
                    </p>
                  </div>
                  <Button asChild className="w-full sm:w-auto">
                    <Link href="/workouts/new">Start Workout</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="progress-heading">
          <SectionHeading
            id="progress-heading"
            eyebrow="Longer-term view"
            title="Progress Snapshot"
            description="A few real signals from your training history."
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <ProgressMetric
              icon={Scale}
              label="Bodyweight"
              value={profile.bodyweightKg ? `${profile.bodyweightKg} kg` : "Not set"}
              detail={profile.bodyweightKg ? "Current profile value" : "Add it in Profile"}
              href="/profile"
            />
            <ProgressMetric
              icon={Trophy}
              label="Latest PR"
              value={
                latestPersonalRecord
                  ? formatPersonalRecordValue(
                      latestPersonalRecord.type as PersonalRecordType,
                      latestPersonalRecord.value
                    )
                  : "No PR yet"
              }
              detail={
                latestPersonalRecord
                  ? `${latestPersonalRecord.exercise.name} · ${
                      PERSONAL_RECORD_LABELS[
                        latestPersonalRecord.type as PersonalRecordType
                      ]
                    }`
                  : "Complete tracked sets"
              }
              href="/profile/records"
            />
            <ProgressMetric
              icon={Medal}
              label="Top muscle this week"
              value={
                mostTrainedMuscle && mostTrainedMuscle.sets > 0
                  ? mostTrainedMuscle.muscle
                  : "No data yet"
              }
              detail={
                mostTrainedMuscle && mostTrainedMuscle.sets > 0
                  ? `${mostTrainedMuscle.sets} completed set${mostTrainedMuscle.sets === 1 ? "" : "s"}`
                  : "Complete a workout"
              }
              href="/profile"
            />
            <ProgressMetric
              icon={Target}
              label="4-week consistency"
              value={consistency ? `${consistency.percentage}%` : "Building history"}
              detail={
                consistency
                  ? `${consistency.metWeeks} of ${consistency.totalWeeks} weeks met goal`
                  : "Available after 4 full weeks"
              }
            />
          </div>
        </section>

        <section aria-labelledby="explore-heading">
          <SectionHeading id="explore-heading" title="Explore" />
          <div className="grid gap-4 sm:grid-cols-2">
            <ExploreCard
              href="/parks"
              icon={MapPin}
              title="Find Parks"
              description="Discover outdoor training spaces near you."
            />
            <ExploreCard
              href="/feed"
              icon={UsersRound}
              title="Community"
              description="See recent training from athletes you follow."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProgressMetric({
  icon: Icon,
  label,
  value,
  detail,
  href,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  detail: string;
  href?: string;
}) {
  const content = (
    <Card className="h-full rounded-2xl shadow-none transition-colors hover:border-primary/30">
      <CardContent className="p-4 sm:p-5">
        <Icon className="size-5 text-primary" aria-hidden={true} />
        <p className="mt-5 text-[0.68rem] font-semibold tracking-[0.13em] text-muted-foreground uppercase sm:text-xs">
          {label}
        </p>
        <p className="mt-2 break-words text-xl font-bold tracking-tight sm:text-2xl">
          {value}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm">
          {detail}
        </p>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function ExploreCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-40 items-end justify-between gap-6 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40 sm:p-7"
    >
      <div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden={true} />
        </span>
        <h3 className="mt-5 text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}
