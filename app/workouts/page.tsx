import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Workouts",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function WorkoutsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const workouts = await prisma.workout.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      startedAt: "desc",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          bodyweightKg: true,
        },
      },
      exercises: {
        include: {
          exercise: true,
          sets: true,
        },
      },
    },
  });

  const summaries = workouts.map(mapWorkoutSummary);

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workouts</h1>
          <p className="text-sm text-muted-foreground">
            Review completed sessions, volume, and exercise history.
          </p>
        </div>
        <Button asChild>
          <Link href="/workouts/new">New Workout</Link>
        </Button>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              No workouts logged yet. Start with a simple session and build the
              habit from there.
            </p>
            <Button asChild>
              <Link href="/workouts/new">Log your first workout</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {summaries.map((workout) => (
            <Link key={workout.id} href={`/workouts/${workout.id}`}>
              <Card className="transition hover:border-primary/50">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {workout.title ?? "Workout"}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {new Date(workout.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={
                          workout.visibility === "PUBLIC" ? "secondary" : "outline"
                        }
                      >
                        {workout.visibility === "PUBLIC" ? "Public" : "Private"}
                      </Badge>
                      <Badge variant="secondary">
                        {workout.exerciseCount} exercises
                      </Badge>
                      <Badge variant="outline">{workout.setCount} sets</Badge>
                      <Badge variant="outline">
                        {workout.totalVolume === null
                          ? "Volume unavailable"
                          : `${workout.totalVolume.toLocaleString()} volume`}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
