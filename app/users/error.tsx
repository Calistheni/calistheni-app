"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PeopleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h1 className="text-xl font-semibold">People search unavailable</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load people right now. Your account and follows
            were not changed.
          </p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
