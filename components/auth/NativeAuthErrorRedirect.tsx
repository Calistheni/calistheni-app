"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function NativeAuthErrorRedirect({ attemptId }: { attemptId: string }) {
  const destination = `/mobile/auth/complete?attempt=${encodeURIComponent(attemptId)}&error=oauth_failed`;

  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Returning to Calistheni</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Google sign-in did not complete. Return to the app to try again.
        </p>
        <Button asChild className="mt-4">
          <a href={destination}>Return to Calistheni</a>
        </Button>
      </section>
    </main>
  );
}
