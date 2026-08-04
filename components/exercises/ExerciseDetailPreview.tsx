"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getExerciseThumbnailSrc } from "@/lib/exercise-display";
import type { ExerciseListItem } from "@/types/workout";

function formatTrackingType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ExerciseDetailPreview({
  exercise,
  compact = false,
  trigger,
}: {
  exercise: ExerciseListItem;
  compact?: boolean;
  trigger?: ReactNode;
}) {
  const imageSrc = getExerciseThumbnailSrc(exercise.thumbnailUrl);

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            size={compact ? "icon-lg" : "sm"}
            variant="ghost"
            className={compact ? "size-11" : "min-h-11"}
            aria-label={`Preview ${exercise.name}`}
            title={`Preview ${exercise.name}`}
          >
            <Info aria-hidden="true" />
            {compact ? null : "Exercise details"}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] overflow-y-auto rounded-t-2xl p-0 md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[32rem] md:max-w-[90vw] md:rounded-none md:border-l"
      >
        <SheetHeader className="border-b pr-14">
          <SheetTitle className="text-xl">{exercise.name}</SheetTitle>
          <SheetDescription>
            Exercise media, tracking, and muscle information.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {exercise.videoUrl ? (
            <video
              src={exercise.videoUrl}
              poster={imageSrc}
              controls
              playsInline
              preload="none"
              aria-label={`${exercise.name} movement video`}
              className="aspect-video w-full rounded-xl bg-black object-contain"
            />
          ) : (
            <Image
              src={imageSrc}
              alt={`${exercise.name} exercise`}
              width={720}
              height={405}
              unoptimized
              className="aspect-video w-full rounded-xl bg-muted object-cover"
            />
          )}

          <section aria-labelledby={`primary-${exercise.id}`}>
            <h3 id={`primary-${exercise.id}`} className="text-sm font-semibold">
              Primary muscles
            </h3>
            <div className="mt-2">
              <Badge variant="secondary">{exercise.muscle}</Badge>
            </div>
          </section>

          <section aria-labelledby={`secondary-${exercise.id}`}>
            <h3
              id={`secondary-${exercise.id}`}
              className="text-sm font-semibold"
            >
              Secondary muscles
            </h3>
            {exercise.secondaryMuscles.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {exercise.secondaryMuscles.map((muscle) => (
                  <Badge key={muscle} variant="outline">
                    {muscle}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No secondary muscles are listed.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">Tracking</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatTrackingType(exercise.trackingType)}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Instructions</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Detailed written instructions are not available for this exercise
              yet. Use the movement media and full exercise page when available.
            </p>
          </section>

          <Button asChild className="w-full">
            <Link href={`/exercises/${encodeURIComponent(exercise.id)}`}>
              Open full exercise page
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
