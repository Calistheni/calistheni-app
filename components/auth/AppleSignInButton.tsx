"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { canUseNativeAppleAuth, performNativeAppleAuth } from "@/lib/native/apple-auth";

export function AppleSignInButton({ callbackUrl }: { callbackUrl?: string | null }) {
  const [busy, setBusy] = useState(false);

  async function authenticate() {
    if (busy) return;
    setBusy(true);
    try {
      if (canUseNativeAppleAuth()) {
        const result = await performNativeAppleAuth("login");
        window.location.assign(result.redirectTo ?? callbackUrl ?? "/home");
        return;
      }
      await signIn("apple", { redirectTo: callbackUrl ?? "/onboarding" });
    } catch (error) {
      const message = error instanceof Error && error.message === "APPLE_AUTH_CANCELLED"
        ? "Apple sign-in was cancelled."
        : "Unable to sign in with Apple. Please try again.";
      toast.error(message);
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full border-black bg-black text-white hover:bg-black/90 hover:text-white dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
      disabled={busy}
      onClick={() => void authenticate()}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {!busy ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
          <path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.6.9-.7 0-1.8-.9-3-.9a4.7 4.7 0 0 0-4 2.4c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4a10.7 10.7 0 0 0 1.4-2.9 4.2 4.2 0 0 1-3.1-3.7ZM14.3 5.7a4.2 4.2 0 0 0 1-3.1 4.4 4.4 0 0 0-2.9 1.5 4 4 0 0 0-1 3c1.1.1 2.2-.5 2.9-1.4Z" />
        </svg>
      ) : null}
      {busy ? "Continuing…" : "Continue with Apple"}
    </Button>
  );
}
