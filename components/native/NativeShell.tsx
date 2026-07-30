"use client";

import { useEffect } from "react";
import { Keyboard, KeyboardStyle } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NativeAuthHandoff } from "@/components/auth/NativeAuthHandoff";
import { useTheme } from "@/components/ThemeProvider";
import {
  isNativeApp,
  isNativePluginAvailable,
} from "@/lib/native/platform";

const isDevelopment = process.env.NODE_ENV === "development";

function logNativeSplash(event: string, detail?: unknown) {
  if (isDevelopment) {
    console.debug(`[native-splash] ${event}`, detail ?? "");
  }
}

/** Native-only presentation and keyboard behavior shared by every route. */
export function NativeShell() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    logNativeSplash("NativeShell mounted");

    const nativeApp = isNativeApp();
    logNativeSplash("Capacitor native platform detected", nativeApp);
    if (!nativeApp) return;

    document.documentElement.dataset.nativeApp = "true";
    void StatusBar.setOverlaysWebView({ overlay: false });

    if (isNativePluginAvailable("SplashScreen")) {
      logNativeSplash("splash hide requested");
      void SplashScreen.hide()
        .then(() => logNativeSplash("splash hide succeeded"))
        .catch((error: unknown) => {
          // launchAutoHide is the native fallback; keep this useful for a
          // genuine bridge/plugin failure without disrupting the web app.
          console.error("[native-splash] splash hide failed", error);
        });
    } else {
      console.warn("[native-splash] SplashScreen plugin is unavailable");
    }

    const handleFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      });
    };

    document.addEventListener("focusin", handleFocus);
    return () => {
      delete document.documentElement.dataset.nativeApp;
      document.removeEventListener("focusin", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;

    const isDark = resolvedTheme === "dark";
    void StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    void StatusBar.setBackgroundColor({
      color: isDark ? "#09090b" : "#ffffff",
    });
    void Keyboard.setStyle({
      style: isDark ? KeyboardStyle.Dark : KeyboardStyle.Light,
    });
  }, [resolvedTheme]);

  return <NativeAuthHandoff />;
}
