import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExerciseClassificationTable,
  type AdminExerciseClassification,
} from "@/components/admin/exercises/ExerciseClassificationTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ExerciseTrackingType } from "@/types/workout";

export const metadata: Metadata = {
  title: "Admin Exercise Classification",
  robots: {
    index: false,
    follow: false,
  },
};

type AdminExercisesPageProps = {
  searchParams: Promise<{
    q?: string;
    trackingType?: string;
    defaultOnly?: string;
  }>;
};

const TRACKING_TYPES: ExerciseTrackingType[] = [
  "NOT_SELECTED",
  "BODYWEIGHT_REPS",
  "WEIGHTED_BODYWEIGHT",
  "EXTERNAL_WEIGHT",
  "DURATION",
  "DISTANCE_DURATION",
  "STEPS_DISTANCE_DURATION",
  "FLOORS_DISTANCE_DURATION",
  "WEIGHT_DISTANCE_DURATION",
];

const TRACKING_TYPE_LABELS: Record<ExerciseTrackingType, string> = {
  NOT_SELECTED: "Not selected",
  BODYWEIGHT_REPS: "Bodyweight reps",
  WEIGHTED_BODYWEIGHT: "Weighted bodyweight",
  EXTERNAL_WEIGHT: "External weight",
  DURATION: "Duration",
  DISTANCE_DURATION: "Distance + time",
  STEPS_DISTANCE_DURATION: "Steps + distance + time",
  FLOORS_DISTANCE_DURATION: "Floors + distance + time",
  WEIGHT_DISTANCE_DURATION: "Weight + distance + time",
};

function isTrackingType(value: string): value is ExerciseTrackingType {
  return TRACKING_TYPES.includes(value as ExerciseTrackingType);
}

export default async function AdminExercisesPage({
  searchParams,
}: AdminExercisesPageProps) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const trackingTypeParam = params.trackingType ?? "";
  const trackingType: ExerciseTrackingType | null = isTrackingType(
    trackingTypeParam
  )
    ? trackingTypeParam
    : null;
  const defaultOnly = params.defaultOnly === "1";
  const where: Prisma.ExerciseWhereInput = {
    ...(q
      ? {
          OR: [
            {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              muscle: {
                contains: q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(defaultOnly
      ? {
          trackingType: "NOT_SELECTED",
        }
      : trackingType !== null
      ? {
          trackingType,
        }
      : {}),
  };
  const exercises = await prisma.exercise.findMany({
    where,
    orderBy: [{ muscle: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      muscle: true,
      thumbnailUrl: true,
      trackingType: true,
      bodyweightLoadFactor: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-3">
            <Link href="/admin">Back to Admin</Link>
          </Button>
          <h1 className="text-3xl font-bold">Exercise Classification</h1>
          <p className="text-sm text-muted-foreground">
            Assign one tracking type to each exercise so workout logging shows
            the right fields and calculates volume safely.
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px_220px_auto_auto]">
            <div className="space-y-2">
              <label htmlFor="exercise-q" className="text-sm font-medium">
                Search
              </label>
              <Input
                id="exercise-q"
                name="q"
                defaultValue={q}
                placeholder="Search by name or muscle"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="tracking-type-filter"
                className="text-sm font-medium"
              >
                Tracking type
              </label>
              <Select name="trackingType" defaultValue={trackingType ?? "all"}>
                <SelectTrigger id="tracking-type-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tracking types</SelectItem>
                  {TRACKING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {TRACKING_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="default-only" className="text-sm font-medium">
                Default filter
              </label>
              <Select name="defaultOnly" defaultValue={defaultOnly ? "1" : "0"}>
                <SelectTrigger id="default-only" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Include all</SelectItem>
                  <SelectItem value="1">Not selected only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Apply
              </Button>
            </div>
            <div className="flex items-end">
              <Button asChild variant="outline" className="w-full">
                <Link href="/admin/exercises">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mb-3 text-sm text-muted-foreground">
        Showing {exercises.length.toLocaleString()} exercise
        {exercises.length === 1 ? "" : "s"}.
      </div>

      <ExerciseClassificationTable
        exercises={exercises as AdminExerciseClassification[]}
      />
    </main>
  );
}
