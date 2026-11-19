"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { NATIVE_AUTH_CALLBACK_PATH } from "@/lib/auth/native-auth";

export default function NativeAuthStartPage() {
  const [error, setError] = useState<string | null>(null);

  async function beginGoogleSignIn() {
    const callbackUrl = new URL(
      NATIVE_AUTH_CALLBACK_PATH,
      window.location.origin
    );
    callbackUrl.pathname = "/api/native-auth/complete";
    try {
      await signIn(
        "google",
        { redirectTo: callbackUrl.toString() },
        { prompt: "select_account" }
      );
    } catch {
      setError("Unable to open Google sign-in. Please try again.");
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void beginGoogleSignIn();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <section className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-4 text-lg font-semibold">Opening Google sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Continue securely in your browser, then return to Calistheni.
        </p>
        {error ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={() => void beginGoogleSignIn()}>Try again</Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
