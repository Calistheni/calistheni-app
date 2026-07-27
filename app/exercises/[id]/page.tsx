import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();
  const exercise = await prisma.exercise.findFirst({
    where: {
      id,
      ...exerciseVisibilityWhere(session?.user?.id),
    },
    select: {
      name: true,
      muscle: true,
    },
  });

  if (!exercise) {
    return {
      title: "Exercise",
    };
  }

  return {
    title: exercise.name,
    description: `${exercise.name} exercise details for ${exercise.muscle}.`,
  };
}

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const exercise = await prisma.exercise.findFirst({
    where: {
      id,
      ...exerciseVisibilityWhere(session?.user?.id),
    },
  });

  if (!exercise) {
    notFound();
  }

  const thumbnailUrl = exercise.thumbnailUrl ?? "/icons/icon.png";

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/exercises" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{exercise.name}</h1>
          <div className="mt-2">
            <p className="text-xs font-medium text-muted-foreground">
              Primary muscles
            </p>
            <Badge className="mt-1" variant="secondary">
              {exercise.muscle}
            </Badge>
          </div>
          {exercise.createdByUserId ? (
            <Badge className="mt-2 ml-2" variant="outline">
              Custom
            </Badge>
          ) : null}
          {exercise.secondaryMuscles.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Secondary muscles
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {exercise.secondaryMuscles.map((muscle) => (
                  <Badge key={muscle} variant="outline">
                    {muscle}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/profile/records/${encodeURIComponent(exercise.id)}`}>
              View Records
            </Link>
          </Button>
          <Button asChild>
            <Link href="/workouts/new">Use in Workout</Link>
          </Button>
          {exercise.createdByUserId === session?.user?.id ? (
            <Button asChild variant="outline">
              <Link href={`/exercises/custom/${exercise.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Movement Video</h2>
          </CardHeader>
          <CardContent>
            {exercise.videoUrl ? (
              <video
                src={exercise.videoUrl}
                poster={thumbnailUrl}
                controls
                playsInline
                preload="none"
                aria-label={`${exercise.name} movement video`}
                className="aspect-video w-full rounded-xl bg-black object-contain"
              />
            ) : (
              <div className="space-y-3">
                <Image
                  src={thumbnailUrl}
                  alt={`${exercise.name} exercise`}
                  width={960}
                  height={540}
                  unoptimized
                  className="aspect-video w-full rounded-xl bg-muted object-cover"
                />
                <p className="text-sm text-muted-foreground">
                  No video is available for this exercise yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Thumbnail</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Image
              src={thumbnailUrl}
              alt=""
              width={640}
              height={360}
              unoptimized
              className="aspect-video w-full rounded-xl bg-muted object-cover"
            />
            <p className="text-sm text-muted-foreground">
              {/* Media is loaded from the configured public R2 assets base URL. */}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
