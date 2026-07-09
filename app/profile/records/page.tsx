import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

export default async function PersonalRecordsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const records = await prisma.personalRecord.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: [{ achievedAt: "desc" }, { value: "desc" }],
    include: {
      exercise: {
        select: {
          id: true,
          slug: true,
          name: true,
          muscle: true,
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/profile" />
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Personal Records</h1>
        <p className="text-sm text-muted-foreground">
          Automatically detected PRs from your completed workout sets.
        </p>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              No PRs yet. Complete sets in a workout and Calistheni will detect
              your best efforts automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {records.map((record) => (
            <Card key={record.id}>
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{record.exercise.muscle}</Badge>
                  <Badge variant="outline">
                    {PERSONAL_RECORD_LABELS[record.type as PersonalRecordType]}
                  </Badge>
                </div>
                <h2 className="text-xl font-semibold">
                  {record.exercise.name}
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-3xl font-bold">
                  {formatPersonalRecordValue(
                    record.type as PersonalRecordType,
                    record.value
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Achieved {new Date(record.achievedAt).toLocaleDateString()}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/workouts/${record.workoutId}`}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    View workout
                  </Link>
                  <Link
                    href={`/exercises/${record.exercise.slug}/progress`}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    View progress
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

