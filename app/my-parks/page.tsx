import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "My Parks",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MyParksPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const parks = await prisma.park.findMany({
    where: {
      submittedById: session.user.id,
      deletedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Parks</h1>
          <p className="text-sm text-muted-foreground">
            Review parks you submitted. Deletions are handled by admins only.
          </p>
        </div>
        <Button asChild>
          <Link href="/submit-park">Submit Park</Link>
        </Button>
      </div>

      {parks.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              You have not submitted any parks yet.
            </p>
            <Button asChild>
              <Link href="/submit-park">Submit your first park</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {parks.map((park) => (
            <Card key={park.id}>
              <CardHeader className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{park.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {park.address ?? "Address unavailable"}
                    </p>
                  </div>
                  <Badge variant="secondary">{park.submissionStatus}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {park.equipment.map((item) => (
                    <Badge key={item.equipmentId} variant="outline">
                      {item.equipment.name}
                    </Badge>
                  ))}
                </div>
                {park.rejectionReason ? (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-muted-foreground">
                    {park.rejectionReason}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {park.submissionStatus === "APPROVED" ? (
                    <Button asChild variant="outline">
                      <Link href={`/parks/${park.id}/edit`}>Suggest Edit</Link>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Awaiting admin review.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
