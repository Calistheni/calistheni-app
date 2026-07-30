"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native/platform";

/** Browser fallback when a Universal/App Link cannot open the installed app. */
export default function NativeAuthCompleteFallbackPage() {
  useEffect(() => {
    if (isNativeApp()) return;
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Opening Calistheni</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If Calistheni does not open automatically, return to the app to finish signing in.
        </p>
      </section>
    </main>
  );
}
