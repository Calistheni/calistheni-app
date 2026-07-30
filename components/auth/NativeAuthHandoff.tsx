"use client";

import { useCallback, useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { isNativeAuthCallbackUrl } from "@/lib/auth/native-auth";
import { isNativeApp } from "@/lib/native/platform";

const isDevelopment = process.env.NODE_ENV === "development";

function logNativeAuthClient(event: string, detail?: Record<string, unknown>) {
  if (isDevelopment) {
    console.debug("[native-auth]", { event, ...detail });
  }
}

function redirectToNativeLoginError() {
  window.location.replace("/login?nativeAuthError=handoff_failed");
}

/** Receives Universal/App Links once, then trades the one-time code for HttpOnly session cookie. */
export function NativeAuthHandoff() {
  const handledUrlsRef = useRef(new Set<string>());
  const isExchangingRef = useRef(false);

  const handleUrl = useCallback(async (rawUrl: string) => {
    if (
      !isNativeAuthCallbackUrl(rawUrl, window.location.origin) ||
      handledUrlsRef.current.has(rawUrl)
    ) {
      return;
    }
    handledUrlsRef.current.add(rawUrl);

    const url = new URL(rawUrl);
    const error = url.searchParams.get("error");
    const attempt = url.searchParams.get("attempt");
    const code = url.searchParams.get("code");
    logNativeAuthClient("universal_link_received", { hasAttempt: Boolean(attempt), hasError: Boolean(error) });

    await Browser.close().catch(() => undefined);
    if (error || !attempt || !code || isExchangingRef.current) {
      toast.error("Google sign-in did not complete. Please try again.");
      redirectToNativeLoginError();
      return;
    }

    isExchangingRef.current = true;
    try {
      const response = await fetch("/api/native-auth/exchange", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt, code }),
      });
      const payload = (await response.json()) as { redirectTo?: string; error?: string };
      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.error ?? "Unable to finish Google sign-in.");
      }
      logNativeAuthClient("native_session_established", { hasRedirect: true });
      // Removes the one-time code from the WebView navigation history.
      window.location.replace(payload.redirectTo);
    } catch (error) {
      console.error("[native-auth] handoff exchange failed", error);
      toast.error("Unable to finish Google sign-in. Please try again.");
      redirectToNativeLoginError();
    } finally {
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
