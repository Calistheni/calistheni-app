"use client";

import { useCallback, useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import {
  isNativeAuthCallbackUrl,
  NATIVE_AUTH_COMPLETION_PATH,
} from "@/lib/auth/native-auth";
import { isNativeApp } from "@/lib/native/platform";

const isDevelopment = process.env.NODE_ENV === "development";

function logNativeAuthClient(event: string, detail?: Record<string, unknown>) {
  if (isDevelopment) {
    console.debug("[native-auth]", { event, ...detail });
  }
}

function redirectToNativeLoginError(reason = "handoff_failed") {
  window.dispatchEvent(new CustomEvent("native-auth:finished"));
  window.location.replace(`/login?nativeAuthError=${encodeURIComponent(reason)}`);
}

/** Receives Universal/App Links once and lets a server navigation set the WebView cookie. */
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
    const code = url.searchParams.get("code");
    logNativeAuthClient("universal_link_received", { hasCode: Boolean(code) });

    await Browser.close().catch(() => undefined);
    if (!code || isExchangingRef.current) {
      toast.error("Google sign-in did not complete. Please try again.");
      redirectToNativeLoginError();
      return;
    }

    isExchangingRef.current = true;
    try {
      const completion = new URL(NATIVE_AUTH_COMPLETION_PATH, window.location.origin);
      completion.searchParams.set("code", code);
      // This full WebView navigation is critical: the server's Set-Cookie is
      // written into WKWebView, never read from Safari.
      window.dispatchEvent(new CustomEvent("native-auth:finished"));
      window.location.replace(completion.toString());
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
