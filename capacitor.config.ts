import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * The Next.js app has authenticated server routes and cannot be statically
 * exported. Capacitor therefore hosts the deployed HTTPS app in its WebView.
 * Override CAPACITOR_SERVER_URL for an HTTPS staging deployment or a reachable
 * local development server before running `mobile:sync`.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://calistheni.app";
const isLocalDevelopmentServer = /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(
  serverUrl
);

const config: CapacitorConfig = {
  appId: "app.calistheni.mobile",
  appName: "Calistheni",
  webDir: "mobile-web",
  backgroundColor: "#09090b",
  loggingBehavior: "debug",
  server: {
    url: serverUrl,
    cleartext: isLocalDevelopmentServer,
    allowNavigation: ["calistheni.app", "*.calistheni.app"],
    // This local, bundled page is used when the remote WebView navigation
    // fails, so an unreachable deployment never leaves a blank native shell.
    errorPath: "error.html",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DEFAULT",
      backgroundColor: "#09090b",
    },
    SplashScreen: {
      // Native auto-hide is the fail-safe for a remote Next.js shell: a
      // successful WKWebView navigation does not guarantee React hydration.
      launchAutoHide: true,
      launchShowDuration: 1_200,
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
  },
};

export default config;
