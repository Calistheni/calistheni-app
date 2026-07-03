import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ExerciseListItem } from "@/types/workout";

type ExerciseGridProps = {
  exercises: ExerciseListItem[];
};

export function ExerciseGrid({ exercises }: ExerciseGridProps) {
  if (exercises.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No exercises matched your filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {exercises.map((exercise) => (
        <Link key={exercise.id} href={`/exercises/${exercise.id}`}>
          <Card className="h-full overflow-hidden transition hover:border-primary/50">
            <Image
              src={exercise.thumbnailUrl ?? "/icon.svg"}
              alt=""
              width={480}
              height={270}
              unoptimized
              className="aspect-video w-full bg-muted object-cover"
            />
            <CardContent className="space-y-2 p-4">
              <Badge variant="secondary">{exercise.muscle}</Badge>
              <h2 className="font-semibold">{exercise.name}</h2>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
