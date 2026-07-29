import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { RoutineDeleteButton } from "@/components/routines/RoutineActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { parsePositiveInteger } from "@/lib/api-response";
import {
  getExerciseThumbnailSrc,
  getExerciseTrackingTypeLabel,
  getRestBadgeLabel,
} from "@/lib/exercise-display";
import { getTrackingTypeFieldConfig } from "@/lib/exercise-tracking-fields";
import { mapRoutineDetail, routineInclude } from "@/lib/routines";
import { prisma } from "@/lib/prisma";
import {
  getSupersetDisplayLabel,
  SUPERSET_COLOR_STYLES,
} from "@/lib/workout-supersets";
import { Layers2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Routine",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const routineId = parsePositiveInteger(id);

  if (routineId === null) {
    notFound();
  }

  const routineRecord = await prisma.workoutTemplate.findFirst({
    where: {
      id: routineId,
      userId: session.user.id,
    },
    include: routineInclude,
  });

  if (!routineRecord) {
    notFound();
  }
  const routine = mapRoutineDetail(routineRecord);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/routines" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{routine.name}</h1>
          <p className="text-sm text-muted-foreground">
            {routine.description ?? "Reusable workout routine"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/workouts/new?routineId=${routine.id}`}>
              Start Workout
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/routines/${routine.id}/edit`}>Edit Routine</Link>
          </Button>
          <RoutineDeleteButton routineId={routine.id} />
        </div>
      </div>

      <div className="space-y-4">
        {routine.exercises.map((routineExercise) => {
          const fieldConfig = getTrackingTypeFieldConfig(
            routineExercise.exercise.trackingType
          );
          const superset =
            routine.supersets.find((item) =>
              item.exerciseClientIds.includes(routineExercise.clientExerciseId)
            ) ??
            (routineExercise.supersetKey
              ? routine.supersets.find(
                  (item) => item.key === routineExercise.supersetKey
                )
              : null);
          const supersetIndex = superset
            ? routine.supersets.findIndex((item) => item.key === superset.key)
            : -1;

          return (
          <Card key={routineExercise.id}>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-3">
                <Image
                  src={getExerciseThumbnailSrc(
                    routineExercise.exercise.thumbnailUrl
                  )}
                  alt=""
                  width={112}
                  height={96}
                  unoptimized
                  className="h-14 w-16 shrink-0 rounded-md bg-muted object-cover"
                />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold sm:text-lg">
                    {routineExercise.exercise.name}
                  </h2>
                  <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                    <Badge variant="secondary">
                      {routineExercise.exercise.muscle}
                    </Badge>
                    <Badge variant="outline" className="max-w-full truncate">
                      {getExerciseTrackingTypeLabel(
                        routineExercise.exercise.trackingType
                      )}
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
                    {!superset && routineExercise.restSeconds !== null ? (
                      <Badge variant="outline">
                        {getRestBadgeLabel(routineExercise.restSeconds)}
                      </Badge>
                    ) : null}
                    {superset && superset.restSeconds !== null ? (
                      <Badge variant="outline">
                        Shared {getRestBadgeLabel(superset.restSeconds)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {routineExercise.sets.map((set, index) => (
                <div
                  key={set.id}
                  className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2"
                >
                  <div className="font-medium">Set {index + 1}</div>
                  {fieldConfig.reps ? <div>Reps: {set.reps ?? "-"}</div> : null}
                  {fieldConfig.weight ? (
                    <div>
                      {fieldConfig.weightLabel}: {set.weightKg ?? "-"} kg
                    </div>
                  ) : null}
                  {fieldConfig.duration ? (
                    <div>
                      Duration:{" "}
                      {set.durationSec === null
                        ? "-"
                        : `${set.durationSec} sec`}
                    </div>
                  ) : null}
                  {fieldConfig.distance ? (
                    <div>Distance: {set.distanceMeters ?? "-"} m</div>
                  ) : null}
                  {fieldConfig.steps ? (
                    <div>Steps: {set.steps ?? "-"}</div>
                  ) : null}
                  {fieldConfig.floors ? (
                    <div>Floors: {set.floors ?? "-"}</div>
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
