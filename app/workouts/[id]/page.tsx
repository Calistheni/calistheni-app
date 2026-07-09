import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SaveWorkoutAsRoutineButton } from "@/components/routines/RoutineActions";
import { DeleteWorkoutButton } from "@/components/workouts/DeleteWorkoutButton";
import { parsePositiveInteger } from "@/lib/api-response";
import {
  formatPersonalRecordValue,
  PERSONAL_RECORD_LABELS,
  type PersonalRecordType,
} from "@/lib/personal-records";
import { prisma } from "@/lib/prisma";
import { mapWorkoutDetail, userWorkoutInclude } from "@/lib/workouts";

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
        {
          visibility: "PUBLIC",
        },
        ...(session?.user?.id
          ? [
              {
                userId: session.user.id,
              },
            ]
          : []),
      ],
    },
    include: userWorkoutInclude,
  });

  if (!workout) {
    if (!session?.user) {
      redirect("/login");
    }

    notFound();
  }

  const detail = mapWorkoutDetail(workout);
  const isOwner = session?.user?.id === workout.userId;
  const personalRecords = isOwner
    ? await prisma.personalRecord.findMany({
        where: {
          userId: workout.userId,
          workoutId: workout.id,
        },
      })
    : [];
  const recordsBySetId = new Map<number, typeof personalRecords>();
  const recordsByWorkoutExerciseId = new Map<string, typeof personalRecords>();

  for (const record of personalRecords) {
    if (record.workoutSetId !== null) {
      recordsBySetId.set(record.workoutSetId, [
        ...(recordsBySetId.get(record.workoutSetId) ?? []),
        record,
      ]);
    } else {
      recordsByWorkoutExerciseId.set(record.exerciseId, [
        ...(recordsByWorkoutExerciseId.get(record.exerciseId) ?? []),
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
        {detail.exercises.map((workoutExercise) => (
          <Card key={workoutExercise.id}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Image
                  src={workoutExercise.exercise.thumbnailUrl ?? "/icon.svg"}
                  alt=""
                  width={224}
                  height={160}
                  unoptimized
                  className="h-20 w-28 rounded-lg bg-muted object-cover"
                />
                <div>
                  <h2 className="text-xl font-semibold">
                    {workoutExercise.exercise.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {workoutExercise.exercise.muscle}
                    </Badge>
                    {(
                      recordsByWorkoutExerciseId.get(
                        workoutExercise.exercise.id
                      ) ?? []
                    ).map((record) => (
                      <Badge key={record.id} variant="outline">
                        PR:{" "}
                        {
                          PERSONAL_RECORD_LABELS[
                            record.type as PersonalRecordType
                          ]
                        }{" "}
                        {formatPersonalRecordValue(
                          record.type as PersonalRecordType,
                          record.value
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {workoutExercise.sets.map((set, index) => (
                <div
                  key={set.id}
                  className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-5"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <span>Set {index + 1}</span>
                    {set.completed ? <Badge>Done</Badge> : null}
                    {(recordsBySetId.get(set.id) ?? []).map((record) => (
                      <Badge key={record.id} variant="secondary">
                        PR:{" "}
                        {
                          PERSONAL_RECORD_LABELS[
                            record.type as PersonalRecordType
                          ]
                        }
                      </Badge>
                    ))}
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
        ))}
      </div>
    </main>
  );
}
