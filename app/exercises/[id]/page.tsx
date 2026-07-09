import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const exercise = await prisma.exercise.findUnique({
    where: {
      id,
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
  const exercise = await prisma.exercise.findUnique({
    where: {
      id,
    },
  });

  if (!exercise) {
    notFound();
  }

  const thumbnailUrl = exercise.thumbnailUrl ?? "/icon.svg";

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/exercises" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{exercise.name}</h1>
          <Badge className="mt-2" variant="secondary">
            {exercise.muscle}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/exercises/${exercise.slug}/progress`}>
              View Progress
            </Link>
          </Button>
          <Button asChild>
            <Link href="/workouts/new">Use in Workout</Link>
          </Button>
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
                preload="metadata"
                className="aspect-video w-full rounded-xl bg-black object-contain"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
                No video is available for this exercise yet.
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
              Media is loaded from the configured public R2 assets base URL.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
