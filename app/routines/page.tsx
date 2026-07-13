import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FREE_ROUTINE_LIMIT, routineInclude } from "@/lib/routines";
import { getUserEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Routines",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RoutinesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [routines, { entitlements }] = await Promise.all([
    prisma.workoutTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: routineInclude,
    }),
    getUserEntitlements(session.user.id),
  ]);
  const atFreeLimit =
    !entitlements.isPro && routines.length >= FREE_ROUTINE_LIMIT;

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackButton fallbackHref="/home" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Routines</h1>
          <p className="text-sm text-muted-foreground">
            Save reusable workout plans and start faster.
          </p>
        </div>
        {atFreeLimit ? (
          <Button asChild>
            <Link href="/pro">Upgrade to Pro</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/routines/new">New Routine</Link>
          </Button>
        )}
      </div>

      {atFreeLimit ? (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-4 text-sm text-muted-foreground">
            You&apos;ve reached the Free limit of {FREE_ROUTINE_LIMIT} routines. {" "}
            <Link href="/pro" className="font-medium text-primary underline">
              Upgrade to Pro
            </Link>{" "}
            for unlimited routines.
          </CardContent>
        </Card>
      ) : null}

      {routines.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              No routines yet. Create your first reusable workout plan.
            </p>
            <Button asChild>
              <Link href="/routines/new">Create Routine</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {routines.map((routine) => (
            <Link key={routine.id} href={`/routines/${routine.id}`}>
              <Card className="transition hover:border-primary/50">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{routine.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {routine.description ?? "No description"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {routine.exercises.length} exercises
                      </Badge>
                      <Badge variant="outline">{routine.visibility}</Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
