import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { FollowButton } from "@/components/social/FollowButton";
import { SocialConnections } from "@/components/social/SocialConnections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { mapWorkoutSummary } from "@/lib/workouts";
import { ClickableWorkoutCard } from "@/components/community/ClickableWorkoutCard";
import { displayUsername } from "@/lib/community";
import { WorkoutSocialActions } from "@/components/community/WorkoutSocialActions";

export const metadata: Metadata = {
  title: "Athlete Profile",
};

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      name: true,
      image: true,
      username: true,
    },
  });

  if (!user) {
    notFound();
  }

  const [workouts, followerCount, followingCount, isFollowing] =
    await Promise.all([
      prisma.workout.findMany({
        where: {
          userId: user.id,
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
        take: 20,
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
          _count: { select: { likes: true, photos: true } },
          likes: { where: { userId: session?.user?.id ?? "" }, select: { userId: true } },
          photos: { orderBy: { createdAt: "asc" }, take: 4, select: { id: true, width: true, height: true } },
        },
      }),
      prisma.userFollow.count({
        where: {
          followingId: user.id,
        },
      }),
      prisma.userFollow.count({
        where: {
          followerId: user.id,
        },
      }),
      session?.user?.id
        ? prisma.userFollow.findUnique({
            where: {
              followerId_followingId: {
                followerId: session.user.id,
                followingId: user.id,
              },
            },
          })
        : null,
    ]);
  const summaries = workouts.map(mapWorkoutSummary);
  const totalSets = summaries.reduce((count, workout) => count + workout.setCount, 0);
  const totalVolume = summaries.some((workout) => workout.totalVolume === null)
    ? null
    : summaries.reduce((sum, workout) => sum + (workout.totalVolume ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/feed" />
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {user.image ? (
              <Image
                src={user.image}
                alt=""
                width={72}
                height={72}
                unoptimized
                className="h-18 w-18 rounded-full bg-muted object-cover"
              />
            ) : (
              <div className="flex h-18 w-18 items-center justify-center rounded-full bg-muted text-xl font-bold">
                {(user.name ?? "U").slice(0, 1)}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold">
                {user.name ?? "Calistheni athlete"}
              </h1>
              <p className="text-sm text-muted-foreground">{displayUsername(user)}</p>
              <SocialConnections
                profileUserId={user.id}
                viewerUserId={session?.user?.id ?? null}
                initialFollowerCount={followerCount}
                initialFollowingCount={followingCount}
              />
              {followerCount === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No followers yet. Their next public workout can still be the
                  first spark.
                </p>
              ) : null}
            </div>
          </div>

          {session?.user?.id && session.user.id !== user.id ? (
            <FollowButton
              userId={user.id}
              initialFollowing={Boolean(isFollowing)}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Public workouts</p>
            <p className="text-2xl font-bold">{summaries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total sets</p>
            <p className="text-2xl font-bold">{totalSets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Volume</p>
            <p className="text-2xl font-bold">
              {totalVolume === null ? "Unavailable" : totalVolume.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Public Workouts</h2>
          <Button asChild variant="outline">
            <Link href="/feed">Open Feed</Link>
          </Button>
        </div>

        {summaries.length === 0 ? (
          <Card>
            <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                No public workouts yet.
              </p>
              <p>
                When this athlete shares a completed public workout, it will
                appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          summaries.map((workout, index) => (
              <ClickableWorkoutCard key={workout.id} href={`/workouts/${workout.id}`} label={`Open ${workout.title ?? "workout"}`}><Card className="transition hover:border-primary/50">
                <CardHeader>
                  <h3 className="text-xl font-semibold">
                    <Link href={`/workouts/${workout.id}`}>
                    {workout.title ?? "Workout"}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(workout.startedAt).toLocaleString()}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
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
                  {workouts[index].photos.length === 1 ? <div className="w-full overflow-hidden rounded-xl bg-muted"><Image src={`/api/workouts/${workout.id}/photos/${workouts[index].photos[0].id}`} alt={`Workout photo from ${workout.title ?? "workout"}`} width={Math.max(1, workouts[index].photos[0].width)} height={Math.max(1, workouts[index].photos[0].height)} unoptimized sizes="(max-width:640px) calc(100vw - 2rem), 768px" className="block h-auto w-full" /></div> : workouts[index].photos.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{workouts[index].photos.map((photo, photoIndex) => <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg"><Image src={`/api/workouts/${workout.id}/photos/${photo.id}`} alt={`Workout photo ${photoIndex + 1}`} fill unoptimized sizes="180px" className="object-cover" />{photoIndex===3&&workouts[index]._count.photos>4?<span className="absolute inset-0 grid place-items-center bg-black/50 text-white">+{workouts[index]._count.photos-4}</span>:null}</div>)}</div> : null}
                  {session?.user?.id ? <WorkoutSocialActions workoutId={workout.id} initialLikeCount={workouts[index]._count.likes} initialLiked={workouts[index].likes.length > 0} canCopy={session.user.id !== user.id} /> : null}
                </CardContent>
              </Card></ClickableWorkoutCard>
          ))
        )}
      </section>
    </main>
  );
}
