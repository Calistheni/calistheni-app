import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DeleteWorkoutButton } from "@/components/workouts/DeleteWorkoutButton";
import { parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { mapWorkoutDetail, userWorkoutInclude } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Workout Details",
  robots: {
    index: false,
    follow: false,
  },
};

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

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href="/workouts">Back to Workouts</Link>
          </Button>
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
              {detail.totalVolume.toLocaleString()}
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
                  <Badge variant="secondary">
                    {workoutExercise.exercise.muscle}
                  </Badge>
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
                  </div>
                  <div>Reps: {set.reps ?? "-"}</div>
                  <div>Weight: {set.weight ?? "-"}</div>
                  <div>Seconds: {set.durationSeconds ?? "-"}</div>
                  <div>Meters: {set.distanceMeters ?? "-"}</div>
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
