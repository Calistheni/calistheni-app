import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CommunityTabs } from "@/components/community/CommunityTabs";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";
import { displayUsername, relativeTime } from "@/lib/community";
import { WorkoutSocialActions } from "@/components/community/WorkoutSocialActions";
import { ClickableWorkoutCard } from "@/components/community/ClickableWorkoutCard";

export const metadata: Metadata = {
  title: "Workout Feed",
  robots: {
    index: false,
    follow: false,
  },
};
export const dynamic = "force-dynamic";

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
              username: true,
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
          likes: { where: { userId: session.user.id }, select: { userId: true } },
          photos: { orderBy: { createdAt: "asc" }, take: 4, select: { id: true, width: true, height: true } },
          _count: { select: { likes: true, comments: true, photos: true } },
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
      <CommunityTabs active="feed" />

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              Your feed is quiet. Follow athletes from their profile pages to see
              public workouts here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/users">Find Athletes</Link>
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
              <ClickableWorkoutCard key={workout.id} href={`/workouts/${workout.id}`} label={`Open ${workout.title ?? "workout"} by ${workout.user?.name ?? "athlete"}`}><Card className="transition-colors hover:border-primary/30">
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
                        {displayUsername(workout.user ?? { id: "athlete" })} · {relativeTime(workoutRecord.completedAt ?? workoutRecord.startedAt)}
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
                      <Badge variant={workout.visibility === "PUBLIC" ? "secondary" : "outline"}>{workout.visibility === "PUBLIC" ? "Public" : "Private"}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {workoutRecord.exercises
                      .map((item) => item.exercise.name)
                      .join(", ")}
                  </p>
                  {workoutRecord.photos.length === 1 ? <div className="w-full overflow-hidden rounded-xl bg-muted"><Image src={`/api/workouts/${workout.id}/photos/${workoutRecord.photos[0].id}`} alt={`Workout photo from ${workout.title ?? "workout"}`} width={Math.max(1, workoutRecord.photos[0].width)} height={Math.max(1, workoutRecord.photos[0].height)} sizes="(max-width:768px) calc(100vw - 2rem), 672px" unoptimized loading="lazy" className="block h-auto w-full" /></div> : workoutRecord.photos.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{workoutRecord.photos.map((photo, photoIndex) => <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted"><Image src={`/api/workouts/${workout.id}/photos/${photo.id}`} alt={`Workout photo ${photoIndex + 1}`} fill sizes="180px" unoptimized loading="lazy" className="object-cover" />{photoIndex === 3 && workoutRecord._count.photos > 4 ? <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">+{workoutRecord._count.photos - 4}</span> : null}</div>)}</div> : null}
                  <WorkoutSocialActions workoutId={workout.id} initialLikeCount={workoutRecord._count.likes} initialLiked={workoutRecord.likes.length > 0} canCopy={workoutRecord.userId !== session.user.id} />
                </CardContent>
              </Card></ClickableWorkoutCard>
            );
          })}
        </div>
      )}
    </main>
  );
}
