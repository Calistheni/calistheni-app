import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://calistheni.app";

const isLocalDevelopmentServer =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(serverUrl);

const config: CapacitorConfig = {
  appId: "com.petershikrenov.calistheni",
  appName: "Calistheni",
  webDir: "mobile-web",

  backgroundColor: "#09090b",
  loggingBehavior:
    process.env.NODE_ENV === "production" ? "production" : "debug",

  server: {
    url: serverUrl,
    cleartext: isLocalDevelopmentServer,
    allowNavigation: ["calistheni.app", "*.calistheni.app"],
    errorPath: "error.html",
  },

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
      resize: KeyboardResize.Native,
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
