import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ImageIcon,
  MapPin,
  MapPinPlus,
  XCircle,
} from "lucide-react";
import { auth } from "@/auth";
import { BackButton } from "@/components/navigation/BackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Park Contributions",
  robots: {
    index: false,
    follow: false,
  },
};

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  if (status === "APPROVED") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle2 aria-hidden="true" />
        Approved
      </Badge>
    );
  }

  if (status === "REJECTED") {
    return (
      <Badge variant="destructive">
        <XCircle aria-hidden="true" />
        Rejected
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      <Clock3 aria-hidden="true" />
      Pending
    </Badge>
  );
}

const submittedDateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
});

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
      createdAt: "desc",
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
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <BackButton fallbackHref="/parks" label="Back to Parks" />

      <div className="max-w-2xl">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          Parks
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Contribute to Parks
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Help the community discover useful training spaces and follow each
          submission through review.
        </p>
      </div>

      <section aria-labelledby="new-submission-heading" className="mt-8">
        <Card className="overflow-hidden border-primary/25 bg-primary/5">
          <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <MapPinPlus className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="new-submission-heading" className="text-xl font-semibold">
                  New submission
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a park location, equipment details, and a photo for admin
                  review.
                </p>
              </div>
            </div>
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link href="/submit-park">
                <MapPinPlus aria-hidden="true" />
                Submit a new park
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="your-submissions-heading" className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="your-submissions-heading" className="text-2xl font-semibold">
              Your submissions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Newest submissions appear first.
            </p>
          </div>
          {parks.length > 0 ? (
            <Badge variant="outline">
              {parks.length} {parks.length === 1 ? "submission" : "submissions"}
            </Badge>
          ) : null}
        </div>

        {parks.length === 0 ? (
          <Card className="mt-5 border-dashed">
            <CardContent className="flex flex-col items-start gap-4 p-6 sm:items-center sm:py-10 sm:text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MapPinPlus className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">You haven’t submitted any parks yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your pending and reviewed park contributions will appear here.
                </p>
              </div>
              <Button asChild>
                <Link href="/submit-park">Submit your first park</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-5 grid gap-4">
            {parks.map((park) => (
              <Card key={park.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">
                    {park.photoUrl ? (
                      <div
                        role="img"
                        aria-label={`${park.name} submitted photo`}
                        className="aspect-[16/9] bg-muted bg-cover bg-center sm:aspect-auto sm:min-h-44"
                        style={{ backgroundImage: `url(${JSON.stringify(park.photoUrl)})` }}
                      />
                    ) : (
                      <div className="flex aspect-[16/9] items-center justify-center bg-muted text-muted-foreground sm:aspect-auto sm:min-h-44">
                        <ImageIcon className="size-6" aria-hidden="true" />
                        <span className="sr-only">No submitted photo</span>
                      </div>
                    )}

                    <div className="min-w-0 space-y-4 p-4 sm:p-5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold">
                            {park.name}
                          </h3>
                          <div className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
                            <p className="flex min-w-0 items-start gap-2">
                              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                              <span className="min-w-0 break-words">
                                {park.address ??
                                  `${park.lat.toFixed(5)}, ${park.lon.toFixed(5)}`}
                              </span>
                            </p>
                            <p className="flex items-center gap-2">
                              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                              Submitted {submittedDateFormatter.format(park.createdAt)}
                            </p>
                          </div>
                        </div>
                        <SubmissionStatusBadge status={park.submissionStatus} />
                      </div>

                      {park.equipment.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5" aria-label="Equipment">
                          {park.equipment.map((item) => (
                            <Badge key={item.equipmentId} variant="outline">
                              {item.equipment.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {park.submissionStatus === "REJECTED" ? (
                        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                          <p className="text-sm font-medium text-destructive">
                            This submission was not approved.
                          </p>
                          {park.rejectionReason ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {park.rejectionReason}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                        <p className="text-sm text-muted-foreground">
                          {park.submissionStatus === "PENDING"
                            ? "Waiting for admin review."
                            : park.submissionStatus === "APPROVED"
                              ? "Approved and available in Parks."
                              : "Review complete."}
                        </p>
                        {park.submissionStatus === "APPROVED" ? (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/parks/${park.id}/edit`}>Suggest edit</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
