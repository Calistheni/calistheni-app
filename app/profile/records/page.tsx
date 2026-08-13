import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { exerciseVisibilityWhere } from "@/lib/exercise-access";
import { getExerciseThumbnailSrc } from "@/lib/exercise-display";
import {
  formatPersonalRecordValue,
  PERSONAL_RECORD_LABELS,
  type PersonalRecordType,
} from "@/lib/personal-records";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Personal Records",
  robots: {
    index: false,
    follow: false,
  },
};

const RECORD_PRIORITY: PersonalRecordType[] = [
  "MAX_REPS",
  "MAX_EXTERNAL_WEIGHT",
  "MAX_ADDED_WEIGHT",
  "LONGEST_DURATION",
  "MAX_EXERCISE_VOLUME",
  "MAX_SET_VOLUME",
];

export default async function PersonalRecordsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [user, exercises] = await Promise.all([prisma.user.findUnique({ where: { id: session.user.id }, select: { measurementSystem: true } }), prisma.exercise.findMany({
    where: {
      ...exerciseVisibilityWhere(session.user.id),
      workoutExercises: {
        some: {
          workout: {
            userId: session.user.id,
          },
          sets: {
            some: {
              completed: true,
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      muscle: true,
      thumbnailUrl: true,
      createdByUserId: true,
      personalRecords: {
        where: {
          userId: session.user.id,
        },
        select: {
          type: true,
          value: true,
          achievedAt: true,
        },
      },
      workoutExercises: {
        where: {
          workout: {
            userId: session.user.id,
          },
          sets: {
            some: {
              completed: true,
            },
          },
        },
        orderBy: {
          workout: {
            startedAt: "desc",
          },
        },
        take: 1,
        select: {
          workout: {
            select: {
              startedAt: true,
            },
          },
        },
      },
    },
  })]);
  const groupedExercises = exercises
    .map((exercise) => ({
      ...exercise,
      latestActivityAt:
        exercise.workoutExercises[0]?.workout.startedAt ?? new Date(0),
      summaryRecords: [...exercise.personalRecords]
        .sort(
          (left, right) =>
            RECORD_PRIORITY.indexOf(left.type as PersonalRecordType) -
            RECORD_PRIORITY.indexOf(right.type as PersonalRecordType)
        )
        .slice(0, 2),
    }))
    .sort(
      (left, right) =>
        right.latestActivityAt.getTime() - left.latestActivityAt.getTime()
    );

  return (
    <main className="mx-auto w-full max-w-5xl p-4 pb-24 sm:p-6 sm:pb-8 lg:p-8">
      <BackButton fallbackHref="/profile" />
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Personal Records</h1>
        <p className="text-sm text-muted-foreground">
          One records page per exercise, combining every supported metric and
          completed performance.
        </p>
      </div>

      {groupedExercises.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              No completed exercise data yet. Complete sets in a workout and
              Calistheni will start tracking your records automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groupedExercises.map((exercise) => (
            <Link
              key={exercise.id}
              href={`/profile/records/${encodeURIComponent(exercise.id)}`}
              className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`View all records for ${exercise.name}`}
            >
              <Card className="h-full transition group-hover:border-primary/40">
                <CardContent className="flex h-full gap-4 p-4">
                  <Image
                    src={getExerciseThumbnailSrc(exercise.thumbnailUrl)}
                    alt=""
                    width={144}
                    height={144}
                    unoptimized
                    className="size-20 shrink-0 rounded-xl bg-muted object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{exercise.muscle}</Badge>
                      {exercise.createdByUserId ? (
                        <Badge variant="outline">Custom</Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-2 truncate text-lg font-semibold">
                      {exercise.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Last performed {" "}
                      {exercise.latestActivityAt.toLocaleDateString()}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {exercise.summaryRecords.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          View completed performance
                        </span>
                      ) : (
                        exercise.summaryRecords.map((record) => (
                          <Badge key={record.type} variant="outline">
                            {
                              PERSONAL_RECORD_LABELS[
                                record.type as PersonalRecordType
                              ]
                            }
                            : {" "}
                            {formatPersonalRecordValue(
                              record.type as PersonalRecordType,
                              record.value,
                              user?.measurementSystem ?? "METRIC"
                            )}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    className="mt-1 size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
