import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { BodyweightForm } from "@/components/profile/BodyweightForm";
import {
  MuscleActivityRadar,
  type MuscleActivityPoint,
} from "@/components/profile/MuscleActivityRadar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatPersonalRecordValue,
  PERSONAL_RECORD_LABELS,
  type PersonalRecordType,
} from "@/lib/personal-records";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Profile",
  robots: {
    index: false,
    follow: false,
  },
};

const MAIN_MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Core",
  "Legs",
  "Glutes",
  "Cardio",
  "Full Body",
] as const;

function getMainMuscleGroup(muscle: string) {
  const normalized = muscle.toLowerCase();

  if (
    normalized.includes("lat") ||
    normalized.includes("back") ||
    normalized.includes("trap") ||
    normalized.includes("rhomboid")
  ) {
    return "Back";
  }

  if (
    normalized.includes("bicep") ||
    normalized.includes("tricep") ||
    normalized.includes("forearm") ||
    normalized.includes("arm")
  ) {
    return "Arms";
  }

  if (
    normalized.includes("ab") ||
    normalized.includes("core") ||
    normalized.includes("oblique")
  ) {
    return "Core";
  }

  if (
    normalized.includes("quad") ||
    normalized.includes("hamstring") ||
    normalized.includes("calf") ||
    normalized.includes("leg") ||
    normalized.includes("adductor") ||
    normalized.includes("abductor")
  ) {
    return "Legs";
  }

  if (normalized.includes("glute")) {
    return "Glutes";
  }

  if (normalized.includes("shoulder") || normalized.includes("delt")) {
    return "Shoulders";
  }

  if (normalized.includes("cardio")) {
    return "Cardio";
  }

  if (normalized.includes("full")) {
    return "Full Body";
  }

  if (normalized.includes("chest") || normalized.includes("pec")) {
    return "Chest";
  }

  return "Full Body";
}

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    workoutCount,
    workoutSets,
    submittedParkCount,
    approvedEditCount,
    approvedPhotoCount,
    profile,
    recentPersonalRecords,
    recentMuscleSets,
  ] = await Promise.all([
    prisma.workout.count({
      where: {
        userId: session.user.id,
      },
    }),
    prisma.workoutSet.count({
      where: {
        workoutExercise: {
          workout: {
            userId: session.user.id,
          },
        },
      },
    }),
    prisma.park.count({
      where: {
        submittedById: session.user.id,
      },
    }),
    prisma.parkEditSubmission.count({
      where: {
        submittedById: session.user.id,
        status: "APPROVED",
      },
    }),
    prisma.parkPhoto.count({
      where: {
        uploadedById: session.user.id,
        park: {
          submissionStatus: "APPROVED",
          deletedAt: null,
        },
      },
    }),
    prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        bodyweightKg: true,
        rpeTrackingEnabled: true,
        rewardPoints: true,
      },
    }),
    prisma.personalRecord.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        achievedAt: "desc",
      },
      take: 5,
      include: {
        exercise: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.workoutSet.findMany({
      where: {
        completed: true,
        workoutExercise: {
          workout: {
            userId: session.user.id,
            startedAt: {
              gte: thirtyDaysAgo,
            },
          },
        },
      },
      select: {
        workoutExercise: {
          select: {
            exercise: {
              select: {
                muscle: true,
              },
            },
          },
        },
      },
    }),
  ]);
  const muscleActivityMap = new Map<string, number>();

  for (const set of recentMuscleSets) {
    const muscle = getMainMuscleGroup(set.workoutExercise.exercise.muscle);
    muscleActivityMap.set(muscle, (muscleActivityMap.get(muscle) ?? 0) + 1);
  }

  const muscleActivity: MuscleActivityPoint[] = MAIN_MUSCLE_GROUPS.map(
    (muscle) => ({
      muscle,
      sets: muscleActivityMap.get(muscle) ?? 0,
    })
  );

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <Card className="mb-6">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt=""
              width={72}
              height={72}
              unoptimized
              className="h-16 w-16 rounded-full bg-muted object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-bold">
              {(session.user.name ?? "U").slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold">
              {session.user.name ?? "Profile"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {session.user.email ?? "Signed in user"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">Calistheni member</Badge>
              <Badge variant="outline">Workout tracker</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Workouts", workoutCount],
          ["Sets", workoutSets],
          ["Parks", submittedParkCount],
          ["Approved edits", approvedEditCount],
          ["Approved photos", approvedPhotoCount],
          ["⭐ Reward Points", profile?.rewardPoints ?? 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <MuscleActivityRadar data={muscleActivity} />

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-2xl font-bold">Rewards</h2>
          <p className="text-sm text-muted-foreground">
            Upgrade to Pro to begin earning reward points.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/rewards">View Rewards</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Recent PRs</h2>
              <p className="text-sm text-muted-foreground">
                Your latest personal records from logged workouts.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/profile/records">View All PRs</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentPersonalRecords.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              Complete workout sets to start collecting personal records.
            </p>
          ) : (
            <div className="grid gap-3">
              {recentPersonalRecords.map((record) => (
                <Link
                  key={record.id}
                  href={`/workouts/${record.workoutId}`}
                  className="rounded-xl border p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{record.exercise.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {
                          PERSONAL_RECORD_LABELS[
                            record.type as PersonalRecordType
                          ]
                        }
                      </p>
                    </div>
                    <p className="text-lg font-bold">
                      {formatPersonalRecordValue(
                        record.type as PersonalRecordType,
                        record.value
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-2xl font-bold">Workout Settings</h2>
          <p className="text-sm text-muted-foreground">
            Bodyweight is used to calculate bodyweight exercise volume.
          </p>
        </CardHeader>
        <CardContent>
          <BodyweightForm
            initialBodyweightKg={profile?.bodyweightKg ?? null}
            initialRpeTrackingEnabled={
              profile?.rpeTrackingEnabled ?? false
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-2xl font-bold">Quick Links</h2>
          <p className="text-sm text-muted-foreground">
            Jump into map, workout, or profile tools.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/workouts/new">Start Workout</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/workouts">My Workouts</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/routines">Routines</Link>
          </Button>
          <Button asChild>
            <Link href="/submit-park">Submit Park</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/my-parks">My Parks</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Open Map</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/feed">Workout Feed</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/users">Find Users</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/users/${session.user.id}`}>Public Profile</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
