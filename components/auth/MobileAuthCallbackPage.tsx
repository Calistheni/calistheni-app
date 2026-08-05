"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createNativeAuthCustomSchemeUrl,
  isNativeAuthCode,
} from "@/lib/auth/native-auth";

/** Browser-only bridge: it never redeems the code or navigates to an app route. */
export function MobileAuthCallbackPage() {
  const launched = useRef(false);
  const [schemeUrl, setSchemeUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    setSchemeUrl(code && isNativeAuthCode(code) ? createNativeAuthCustomSchemeUrl(code) : null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!schemeUrl || launched.current) return;
    launched.current = true;
    // One best-effort attempt. The visible anchor remains available if iOS
    // suppresses an automatic custom-scheme launch.
    window.location.assign(schemeUrl);
  }, [schemeUrl]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Calistheni</p>
        <h1 className="mt-2 text-lg font-semibold">Opening Calistheni</h1>
        {!loaded ? null : schemeUrl ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              If Calistheni does not open automatically, tap Open Calistheni.
            </p>
            <Button asChild className="mt-5 w-full">
              <a href={schemeUrl}>Open Calistheni</a>
            </Button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            This sign-in link is invalid or has expired. Return to Calistheni and try again.
          </p>
        )}
      </section>
    </main>
  );
}
