"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getNativePlatform, isNativeApp } from "@/lib/native/platform";
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
    let browserFinished: Awaited<ReturnType<typeof Browser.addListener>> | undefined;
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
    }).then((handle) => (browserFinished = handle));
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !successfulCallbackRef.current) clear();
    }).then((handle) => (appState = handle));
    return () => {
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
        await signIn("google", {
          redirectTo: callbackUrl
            ? sanitizeNativeRedirectPath(callbackUrl)
            : "/onboarding",
        });
        return;
      }

      const platform = getNativePlatform() === "ios" ? "IOS" : "ANDROID";
      const response = await fetch("/api/native-auth/attempt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          redirectTo: callbackUrl
            ? sanitizeNativeRedirectPath(callbackUrl)
            : "/home",
        }),
      });
      const payload = (await response.json()) as {
        externalAuthUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.externalAuthUrl) {
        throw new Error(payload.error ?? "Unable to start Google sign-in.");
      }

      await Browser.open({ url: payload.externalAuthUrl, presentationStyle: "fullscreen" });
      // Browser.open resolving means its sheet was presented, not that OAuth succeeded.
      window.setTimeout(() => setIsSubmitting(false), 5 * 60 * 1000);
    } catch (error) {
      console.error("[native-auth] external authorization failed", error);
      toast.error(
        error instanceof Error ? error.message : "Unable to start Google sign-in."
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
