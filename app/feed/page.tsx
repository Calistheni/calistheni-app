import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";

export const metadata: Metadata = {
  title: "Workout Feed",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function FeedPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const following = await prisma.userFollow.findMany({
    where: {
      followerId: session.user.id,
    },
    select: {
      followingId: true,
    },
  });
  const followingIds = following.map((item) => item.followingId);
  const workouts = followingIds.length
    ? await prisma.workout.findMany({
        where: {
          userId: {
            in: followingIds,
          },
          visibility: "PUBLIC",
          completedAt: {
            not: null,
          },
          exercises: {
            none: {
              exercise: { createdByUserId: { not: null } },
            },
          },
        },
        orderBy: {
          completedAt: "desc",
        },
        take: 50,
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
      })
    : [];
  const summaries = workouts.map(mapWorkoutSummary);

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workout Feed</h1>
          <p className="text-sm text-muted-foreground">
            Completed public workouts from people you follow.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/workouts/new">Start Workout</Link>
        </Button>
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              Your feed is quiet. Follow athletes from their profile pages to see
              public workouts here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/users">Find Users</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/profile">Open Profile</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {summaries.map((workout, index) => {
            const workoutRecord = workouts[index];

            return (
              <Card
                key={workout.id}
                className="transition-colors hover:border-primary/30"
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-3">
                    {workout.user?.image ? (
                      <Image
                        src={workout.user.image}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded-full bg-muted object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                        {(workout.user?.name ?? "U").slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <Link
                        href={`/users/${workout.user?.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {workout.user?.name ?? "Calistheni athlete"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(workout.startedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">
                      <Link href={`/workouts/${workout.id}`}>
                        {workout.title ?? "Workout"}
                      </Link>
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {workoutRecord.exercises
                      .map((item) => item.exercise.name)
                      .join(", ")}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
