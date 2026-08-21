"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NativeAuthHandoff } from "@/components/auth/NativeAuthHandoff";
import { useTheme } from "@/components/ThemeProvider";
import { isNativeApp, isNativePluginAvailable } from "@/lib/native/platform";
import {
  reconcileSupplementReminders,
  registerSupplementNotificationListeners,
} from "@/lib/native/supplement-reminders";
import { dismissActiveTextInput } from "@/lib/mobile-keyboard";

const isDevelopment = process.env.NODE_ENV === "development";
let iOSKeyboardResizeSetup: Promise<void> | null = null;

function logKeyboardResize(event: string, detail?: unknown) {
  if (!isDevelopment) return;
  const workoutScrollOwner = document.querySelector<HTMLElement>(
    "[data-active-workout-scroll-owner]"
  );
  console.debug(`[native-keyboard] ${event}`, {
    detail,
    innerHeight: window.innerHeight,
    visualViewportHeight: window.visualViewport?.height ?? null,
    windowScrollY: window.scrollY,
    documentScrollTop: document.scrollingElement?.scrollTop ?? null,
    workoutScrollTop: workoutScrollOwner?.scrollTop ?? null,
  });
}

function configureIOSKeyboardResize() {
  if (!iOSKeyboardResizeSetup) {
    iOSKeyboardResizeSetup = Keyboard.setResizeMode({
      mode: KeyboardResize.Body,
    })
      .then(() => Keyboard.getResizeMode())
      .then(({ mode }) => logKeyboardResize("resize mode selected", mode))
      .catch((error: unknown) => {
        logKeyboardResize("resize mode setup failed", String(error));
      });
  }
  return iOSKeyboardResizeSetup;
}

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
    void registerSupplementNotificationListeners();
    let lastReconciliation = 0;
    let appListener: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive || Date.now() - lastReconciliation < 10_000) return;
      lastReconciliation = Date.now();
      void reconcileSupplementReminders();
    }).then((listener) => {
      appListener = listener;
    });
    // First meaningful paint and the splash dismissal win the launch critical
    // path. Notification reconciliation can safely happen just afterwards.
    lastReconciliation = Date.now();
    const reconciliationTimer = window.setTimeout(() => {
      void reconcileSupplementReminders();
    }, 750);
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

    return () => {
      delete document.documentElement.dataset.nativeApp;
      window.clearTimeout(reconciliationTimer);
      void appListener?.remove();
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp() || Capacitor.getPlatform() !== "ios") return;

    let disposed = false;
    const listeners: Array<{ remove: () => Promise<void> }> = [];
    const addListener = (promise: Promise<{ remove: () => Promise<void> }>) => {
      void promise.then((listener) => {
        if (disposed) void listener.remove();
        else listeners.push(listener);
      });
    };

    // Config applies before the bridge starts; also set the documented iOS
    // mode once per app session so a stale native bundle cannot leave the
    // active WebView on the old frame-resizing mode.
    void configureIOSKeyboardResize();

    if (isDevelopment) {
      addListener(
        Keyboard.addListener("keyboardWillShow", (detail) =>
          logKeyboardResize("keyboardWillShow", detail)
        )
      );
      addListener(
        Keyboard.addListener("keyboardDidShow", (detail) =>
          logKeyboardResize("keyboardDidShow", detail)
        )
      );
      addListener(
        Keyboard.addListener("keyboardWillHide", () =>
          logKeyboardResize("keyboardWillHide")
        )
      );
      addListener(
        Keyboard.addListener("keyboardDidHide", () =>
          logKeyboardResize("keyboardDidHide")
        )
      );
    }

    return () => {
      disposed = true;
      for (const listener of listeners) void listener.remove();
    };
  }, []);

  useEffect(() => {
    let touchStartY = 0;
    let scrollOwner: HTMLElement | null = null;
    let initialScrollTop = 0;
    const handleTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
      const target = event.target instanceof Element ? event.target : null;
      // An editable control's touch is a focus gesture, never a
      // scroll-to-dismiss gesture. In particular, this prevents the native
      // WebView's initial touch sequence from being coupled to our keyboard
      // dismissal bookkeeping before the keyboard is presented.
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        scrollOwner = null;
        initialScrollTop = 0;
        logKeyboardResize("touchstart editable", {
          target: target.tagName,
          windowScrollY: window.scrollY,
          documentScrollTop: document.documentElement.scrollTop,
        });
        return;
      }
      scrollOwner = target?.closest(
        "[data-keyboard-dismiss-on-scroll]"
      ) as HTMLElement | null;
      initialScrollTop = scrollOwner?.scrollTop ?? 0;
      logKeyboardResize("touchstart scroll owner", {
        scrollOwner: scrollOwner?.getAttribute("data-slot") ?? null,
        scrollTop: initialScrollTop,
      });
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (
        !scrollOwner ||
        Math.abs((event.touches[0]?.clientY ?? touchStartY) - touchStartY) < 8
      )
        return;

      const owner = scrollOwner;
      const scrollTopAtTouchStart = initialScrollTop;

      // A finger can drift slightly while iOS is focusing a field. Dismissing
      // here used to blur that field before the marked scroll surface had
      // moved, which made the native keyboard resize race the focus sequence.
      // Keep scroll-to-dismiss, but only after the user actually scrolls.
      requestAnimationFrame(() => {
        if (owner.scrollTop !== scrollTopAtTouchStart) {
          dismissActiveTextInput();
          if (scrollOwner === owner) scrollOwner = null;
        }
      });
    };
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
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
