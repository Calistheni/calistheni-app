import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Layers2 } from "lucide-react";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { ExerciseDetailPreview } from "@/components/exercises/ExerciseDetailPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SaveWorkoutAsRoutineButton } from "@/components/routines/RoutineActions";
import { DeleteWorkoutButton } from "@/components/workouts/DeleteWorkoutButton";
import { WorkoutSocialActions } from "@/components/community/WorkoutSocialActions";
import { parsePositiveInteger } from "@/lib/api-response";
import {
  formatPersonalRecordValue,
  PERSONAL_RECORD_LABELS,
  type PersonalRecordType,
} from "@/lib/personal-records";
import { prisma } from "@/lib/prisma";
import { mapWorkoutDetail, userWorkoutInclude } from "@/lib/workouts";
import {
  getSupersetDisplayLabel,
  SUPERSET_COLOR_STYLES,
} from "@/lib/workout-supersets";

export const metadata: Metadata = {
  title: "Workout Details",
  robots: {
    index: false,
    follow: false,
  },
};

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "-";
  }

  if (durationSeconds % 60 === 0) {
    return `${durationSeconds / 60} min`;
  }

  return `${durationSeconds} sec`;
}

function shouldShowWeight(trackingType: string, weight: number | null) {
  return (
    trackingType === "NOT_SELECTED" ||
    trackingType === "WEIGHTED_BODYWEIGHT" ||
    trackingType === "EXTERNAL_WEIGHT" ||
    trackingType === "WEIGHT_DISTANCE_DURATION" ||
    weight !== null
  );
}

function shouldShowDuration(
  trackingType: string,
  durationSeconds: number | null
) {
  return (
    trackingType === "NOT_SELECTED" ||
    trackingType === "DURATION" ||
    trackingType === "DISTANCE_DURATION" ||
    trackingType === "STEPS_DISTANCE_DURATION" ||
    trackingType === "FLOORS_DISTANCE_DURATION" ||
    trackingType === "WEIGHT_DISTANCE_DURATION" ||
    durationSeconds !== null
  );
}

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  const { id } = await params;
  const workoutId = parsePositiveInteger(id);

  if (workoutId === null) {
    notFound();
  }

  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      OR: [
        ...(session?.user?.id
          ? [
              {
                userId: session.user.id,
              },
            ]
          : []),
        {
          visibility: "PUBLIC",
          exercises: {
            none: {
              exercise: { createdByUserId: { not: null } },
            },
          },
        },
      ],
    },
    include: {
      ...userWorkoutInclude,
      user: { select: { id: true, name: true, username: true, image: true, bodyweightKg: true } },
      _count: { select: { likes: true, comments: true } },
      likes: { where: { userId: session?.user?.id ?? "" }, select: { userId: true } },
    },
  });

  if (!workout) {
    if (!session?.user) {
      redirect("/login");
    }

    notFound();
  }

  const detail = mapWorkoutDetail(workout);
  const isOwner = session?.user?.id === workout.userId;
  const exerciseIds = detail.exercises.map(
    (workoutExercise) => workoutExercise.exercise.id
  );
  const allTimePersonalRecords = isOwner
    ? await prisma.personalRecord.findMany({
        where: {
          userId: workout.userId,
          exerciseId: {
            in: exerciseIds,
          },
        },
        orderBy: [{ exerciseId: "asc" }, { type: "asc" }],
      })
    : [];
  const recordsAchievedInWorkout = allTimePersonalRecords.filter(
    (record) => record.workoutId === workout.id
  );
  const recordsBySetId = new Map<number, typeof recordsAchievedInWorkout>();
  const allTimeRecordsByExerciseId = new Map<
    string,
    typeof allTimePersonalRecords
  >();

  for (const record of allTimePersonalRecords) {
    allTimeRecordsByExerciseId.set(record.exerciseId, [
      ...(allTimeRecordsByExerciseId.get(record.exerciseId) ?? []),
      record,
    ]);
  }

  for (const record of recordsAchievedInWorkout) {
    if (record.workoutSetId !== null) {
      recordsBySetId.set(record.workoutSetId, [
        ...(recordsBySetId.get(record.workoutSetId) ?? []),
        record,
      ]);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/workouts" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{detail.title ?? "Workout"}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(detail.startedAt).toLocaleString()}
          </p>
          {!isOwner ? <p className="text-sm text-muted-foreground">Shared by <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/users/${workout.user.id}`}>{workout.user.name ?? "Calistheni athlete"}</Link></p> : null}
        </div>
        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/workouts/${detail.id}/edit`}>Edit Workout</Link>
            </Button>
            <SaveWorkoutAsRoutineButton workoutId={detail.id} />
            <DeleteWorkoutButton workoutId={detail.id} />
          </div>
        ) : null}
      </div>

      {session?.user?.id ? <div className="mb-6"><WorkoutSocialActions workoutId={workout.id} initialLikeCount={workout._count.likes} initialLiked={workout.likes.length > 0} canCopy={!isOwner} /></div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total sets</p>
            <p className="text-2xl font-bold">{detail.setCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Volume</p>
            <p className="text-2xl font-bold">
              {detail.totalVolume === null
                ? "Unavailable"
                : detail.totalVolume.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Visibility</p>
            <p className="text-2xl font-bold">
              {detail.visibility === "PUBLIC" ? "Public" : "Private"}
            </p>
          </CardContent>
        </Card>
      </div>

      {detail.notes ? (
        <Card className="mb-6">
          <CardContent className="p-4 text-sm text-muted-foreground">
            {detail.notes}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {detail.exercises.map((workoutExercise) => {
          const superset =
            detail.supersets.find((item) =>
              item.exerciseLocalIds.includes(String(workoutExercise.id))
            ) ??
            (workoutExercise.supersetKey
              ? detail.supersets.find(
                  (item) => item.key === workoutExercise.supersetKey
                )
              : null);
          const supersetIndex = superset
            ? detail.supersets.findIndex((item) => item.key === superset.key)
            : -1;

          return (
          <Card key={workoutExercise.id} className="relative overflow-hidden">
            {superset ? (
              <span
                className={`absolute inset-y-0 left-0 w-1 ${
                  SUPERSET_COLOR_STYLES[superset.colorKey].accent
                }`}
                aria-hidden="true"
              />
            ) : null}
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Image
                  src={
                    workoutExercise.exercise.thumbnailUrl ?? "/icons/icon.png"
                  }
                  alt=""
                  width={224}
                  height={160}
                  unoptimized
                  className="h-20 w-28 rounded-lg bg-muted object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">
                    <Link
                      href={`/exercises/${encodeURIComponent(
                        workoutExercise.exercise.id
                      )}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {workoutExercise.exercise.name}
                    </Link>
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {workoutExercise.exercise.muscle}
                    </Badge>
                    {superset ? (
                      <Badge
                        variant="outline"
                        className={
                          SUPERSET_COLOR_STYLES[superset.colorKey].badge
                        }
                      >
                        <Layers2 />
                        {getSupersetDisplayLabel(superset, supersetIndex)}
                      </Badge>
                    ) : null}
                    {workoutExercise.exercise.secondaryMuscles.length ? (
                      <Badge variant="outline">
                        +{workoutExercise.exercise.secondaryMuscles.length} secondary
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <ExerciseDetailPreview
                  exercise={workoutExercise.exercise}
                  compact
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(allTimeRecordsByExerciseId.get(workoutExercise.exercise.id) ??
                []).length > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    All-time PRs
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      allTimeRecordsByExerciseId.get(
                        workoutExercise.exercise.id
                      ) ?? []
                    ).map((record) => (
                      <Badge
                        key={record.id}
                        variant={
                          record.workoutId === workout.id
                            ? "secondary"
                            : "outline"
                        }
                        className="h-auto max-w-full whitespace-normal py-1 leading-snug"
                      >
                        {PERSONAL_RECORD_LABELS[
                          record.type as PersonalRecordType
                        ]}{" "}
                        {formatPersonalRecordValue(
                          record.type as PersonalRecordType,
                          record.value
                        )}
                        {record.workoutId === workout.id
                          ? " · achieved here"
                          : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {workoutExercise.sets.map((set, index) => (
                <div
                  key={set.id}
                  className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-5 sm:items-start"
                >
                  <div className="space-y-2 font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Set {index + 1}</span>
                      {set.completed ? <Badge>Done</Badge> : null}
                    </div>
                    {(recordsBySetId.get(set.id) ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(recordsBySetId.get(set.id) ?? []).map((record) => (
                          <Badge
                            key={record.id}
                            variant="secondary"
                            className="h-auto whitespace-normal py-1 leading-snug"
                          >
                            New PR:{" "}
                            {
                              PERSONAL_RECORD_LABELS[
                                record.type as PersonalRecordType
                              ]
                            }
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {workoutExercise.exercise.trackingType ===
                    "NOT_SELECTED" ||
                  workoutExercise.exercise.trackingType ===
                    "BODYWEIGHT_REPS" ||
                  workoutExercise.exercise.trackingType ===
                    "WEIGHTED_BODYWEIGHT" ||
                  workoutExercise.exercise.trackingType ===
                    "EXTERNAL_WEIGHT" ||
                  set.reps !== null ? (
                    <div>Reps: {set.reps ?? "-"}</div>
                  ) : null}
                  {shouldShowWeight(
                    workoutExercise.exercise.trackingType,
                    set.weight
                  ) ? (
                    <div>
                      {workoutExercise.exercise.trackingType ===
                      "WEIGHTED_BODYWEIGHT"
                        ? "Added weight"
                        : "Weight"}
                      : {set.weight ?? "-"}
                    </div>
                  ) : null}
                  {shouldShowDuration(
                    workoutExercise.exercise.trackingType,
                    set.durationSeconds
                  ) ? (
                    <div>Duration: {formatDuration(set.durationSeconds)}</div>
                  ) : null}
                  {set.distanceMeters !== null ? (
                    <div>Meters: {set.distanceMeters}</div>
                  ) : null}
                  {set.steps !== null ? <div>Steps: {set.steps}</div> : null}
                  {set.floors !== null ? (
                    <div>Floors: {set.floors}</div>
                  ) : null}
                  {set.notes ? (
                    <div className="text-muted-foreground sm:col-span-5">
                      {set.notes}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          );
        })}
      </div>
    </main>
  );
}
