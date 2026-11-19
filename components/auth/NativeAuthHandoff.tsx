"use client";

import { useCallback, useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import {
  NATIVE_AUTH_COMPLETION_PATH,
  parseNativeAuthCallbackUrl,
  sanitizeNativeRedirectPath,
} from "@/lib/auth/native-auth";
import { takeNativeGoogleHandoff } from "@/lib/native/google-handoff";
import { isNativeApp } from "@/lib/native/platform";

const isDevelopment = process.env.NODE_ENV === "development";

function logNativeAuthClient(event: string, detail?: Record<string, unknown>) {
  if (isDevelopment) {
    console.debug("[native-auth]", { event, ...detail });
  }
}

/** Redeems the browser result from the initiating WebView. */
export function NativeAuthHandoff() {
  const isExchangingRef = useRef(false);

  const handleUrl = useCallback(async (rawUrl: string) => {
    const handoff = parseNativeAuthCallbackUrl(rawUrl, window.location.origin);
    if (!handoff || isExchangingRef.current) return;
    isExchangingRef.current = true;
    try {
      const proof = takeNativeGoogleHandoff(handoff.attempt);
      if (!proof) return;
      logNativeAuthClient("native_callback_received");
      await Browser.close().catch(() => undefined);
      const response = await fetch(NATIVE_AUTH_COMPLETION_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      });
      if (!response.ok) throw new Error("Handoff rejected");
      const { redirectTo } = await response.json();
      window.location.replace(sanitizeNativeRedirectPath(redirectTo));
    } catch {
      toast.error("Unable to finish Google sign-in. Please try again.");
    } finally {
      window.dispatchEvent(new CustomEvent("native-auth:finished"));
      isExchangingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;

    let active = true;
    let disposed = false;
    let listener: Awaited<ReturnType<typeof App.addListener>> | undefined;

    void App.getLaunchUrl().then((launch) => {
      if (active && launch?.url) void handleUrl(launch.url);
    });
    void App.addListener("appUrlOpen", ({ url }) => {
      if (active) void handleUrl(url);
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listener = handle;
      }
    });

    return () => {
      active = false;
      disposed = true;
      void listener?.remove();
    };
  }, [handleUrl]);

  return null;
}
