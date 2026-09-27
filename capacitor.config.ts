import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";
import { resolveCapacitorRuntimeMode } from "./lib/capacitor-runtime-mode";

const runtime = resolveCapacitorRuntimeMode(process.env);

const isLocalDevelopmentServer =
  runtime.serverUrl !== undefined &&
  /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(
    runtime.serverUrl
  );

console.info(
  runtime.kind === "bundled"
    ? `[Capacitor] Bundled native mode: ${runtime.webDir} (server.url omitted)`
    : `[Capacitor] Remote runtime mode: ${runtime.serverUrl}`
);

const config: CapacitorConfig = {
  appId: "com.petershikrenov.calistheni",
  appName: "Calistheni",
  webDir: runtime.webDir,

  backgroundColor: "#09090b",
  loggingBehavior:
    process.env.NODE_ENV === "production" ? "production" : "debug",

  ...(runtime.kind === "remote"
    ? {
        server: {
          url: runtime.serverUrl,
          cleartext: isLocalDevelopmentServer,
          allowNavigation: ["calistheni.app", "*.calistheni.app"],
          errorPath: "error.html",
        },
      }
    : {}),

  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#09090b",
    },

    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      launchFadeOutDuration: 200,
      backgroundColor: "#09090b",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },

    Keyboard: {
      // Keep the WKWebView frame stable on iOS. `native` resizes that frame
      // after each keyboard notification, which creates a second layout pass
      // for fixed React overlays. The plugin resizes only document.body here.
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
      autoBackdropColor: "dom",
    },

    // Local-only reminders: no APNs/FCM capability or background remote push.
    LocalNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
