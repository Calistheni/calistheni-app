"use client";

import { Capacitor } from "@capacitor/core";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { nativeClientConfig } from "@native/lib/config";
import { currentNutritionDate, missingPrimaryQueries, primaryQueryKey } from "@native/lib/primary-data";
import { getNativeQueryClient, getNativeQueryClientDebugId } from "@native/lib/query-client";
import { getNativeAuthDiagnostics, getNativeNavigationDiagnostics } from "@native/lib/runtime-diagnostics";
import { getNativePrimaryHref } from "@native/lib/navigation";
import { useNativeAuth } from "./NativeAuthProvider";

type NativeRuntimeManifest = { runtime: string; buildId: string; builtAt: string };

declare global {
  interface Window {
    __CALISTHENI_NATIVE_DIAGNOSTICS__?: () => unknown;
  }
}

export function NativeRuntimeDiagnostics() {
  const { state, authStage, authFailure } = useNativeAuth();
  const pathname = usePathname();
  const enabled = process.env.NEXT_PUBLIC_CALISTHENI_NATIVE_DIAGNOSTICS === "1";
  const originViolation = enabled && typeof window !== "undefined" && Capacitor.isNativePlatform() && window.location.origin === "https://calistheni.app";
  const [manifest, setManifest] = useState<NativeRuntimeManifest | null>(null);
  const [, redraw] = useState(0);
  const queryClient = getNativeQueryClient();
  const navigation = getNativeNavigationDiagnostics();
  const latestNavigation = navigation.at(-1);
  const activeHref = latestNavigation?.activeSurfaceAfter ?? getNativePrimaryHref(pathname);
  const userId = state.status === "authenticated" ? state.bootstrap.user.id : null;
  const diagnostics = useMemo(() => {
    const rewards = userId ? queryClient.getQueryData(primaryQueryKey(userId, "rewards")) !== undefined : false;
    const profile = userId ? queryClient.getQueryData(primaryQueryKey(userId, "profile")) !== undefined : false;
    return {
      runtime: manifest?.runtime ?? "manifest-pending",
      buildId: manifest?.buildId ?? "pending",
      href: typeof window === "undefined" ? "server" : window.location.href,
      origin: typeof window === "undefined" ? "server" : window.location.origin,
      pathname: typeof window === "undefined" ? "server" : window.location.pathname,
      nativePlatform: Capacitor.isNativePlatform(),
      runtimeInvariant: originViolation ? "unexpected-remote-origin" : "ok",
      activeSurface: activeHref,
      generation: latestNavigation?.generation ?? 0,
      queryClient: getNativeQueryClientDebugId(),
      bootstrap: state.status,
      authStage,
      authFailure,
      primaryReady: Boolean(userId && missingPrimaryQueries(queryClient, userId, currentNutritionDate()).length === 0),
      rewardsSnapshot: rewards,
      profileSnapshot: profile,
      apiOrigin: nativeClientConfig.apiOrigin,
      auth: getNativeAuthDiagnostics(),
      navigation,
    };
  }, [activeHref, authFailure, authStage, latestNavigation?.generation, manifest, navigation, originViolation, queryClient, state.status, userId]);

  useEffect(() => {
    if (!enabled) return;
    void fetch("/native-runtime.json", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: NativeRuntimeManifest) => setManifest(value))
      .catch(() => setManifest({ runtime: "manifest-error", buildId: "unavailable", builtAt: "" }));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    window.__CALISTHENI_NATIVE_DIAGNOSTICS__ = () => ({
      ...diagnostics,
      activeDomComponent: document
        .querySelector<HTMLElement>("[data-native-surface]:not([hidden]) [data-native-component]")
        ?.dataset.nativeComponent ?? "missing",
    });
    const refresh = () => redraw((value) => value + 1);
    window.addEventListener("calistheni:native-diagnostics", refresh);
    return () => {
      delete window.__CALISTHENI_NATIVE_DIAGNOSTICS__;
      window.removeEventListener("calistheni:native-diagnostics", refresh);
    };
  }, [diagnostics, enabled]);

  // The visible control is installed by MainViewController only in DEBUG.
  // This component only exposes the safe payload to that native-layer panel.
  return null;
}
