"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { openNativeGoogleAuth } from "@/lib/native/google-handoff";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native/platform";
import { sanitizeNativeRedirectPath } from "@/lib/auth/native-auth";

type NativeGoogleSignInButtonProps = {
  callbackUrl?: string | null;
};

export function NativeGoogleSignInButton({
  callbackUrl,
}: NativeGoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const successfulCallbackRef = useRef(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    let disposed = false;
    let browserFinished:
      | Awaited<ReturnType<typeof Browser.addListener>>
      | undefined;
    let appState: Awaited<ReturnType<typeof App.addListener>> | undefined;
    const clear = () => setIsSubmitting(false);
    const completed = () => {
      successfulCallbackRef.current = true;
      clear();
    };
    window.addEventListener("native-auth:finished", completed);
    void Browser.addListener("browserFinished", () => {
      // A completed Universal Link also closes Browser; the appUrlOpen handler
      // immediately navigates away, while a regular close returns a usable UI.
      clear();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else browserFinished = handle;
    });
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !successfulCallbackRef.current) clear();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else appState = handle;
    });
    return () => {
      disposed = true;
      window.removeEventListener("native-auth:finished", completed);
      void browserFinished?.remove();
      void appState?.remove();
    };
  }, []);

  async function handleSignIn() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!isNativeApp()) {
        // This is Auth.js's normal browser flow and deliberately remains so.
        await signIn(
          "google",
          {
            redirectTo: callbackUrl
              ? sanitizeNativeRedirectPath(callbackUrl)
              : "/onboarding",
          },
          { prompt: "select_account" }
        );
        return;
      }

      await openNativeGoogleAuth("login", callbackUrl ? sanitizeNativeRedirectPath(callbackUrl) : "/home");
      // Browser.open resolving means its sheet was presented, not that OAuth succeeded.
      window.setTimeout(() => setIsSubmitting(false), 5 * 60 * 1000);
    } catch (error) {
      console.error("[native-auth] external authorization failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start Google sign-in."
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      className="w-full"
      onClick={handleSignIn}
      disabled={isSubmitting}
    >
      {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
      {isSubmitting ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}
