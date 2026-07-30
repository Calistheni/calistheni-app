"use client";

import { useState } from "react";
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
