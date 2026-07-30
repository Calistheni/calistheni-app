import { Capacitor } from "@capacitor/core";

/**
 * Single source of truth for native-shell detection. Future native features
 * must use this helper instead of scattering platform checks throughout UI.
 */
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function isNativePluginAvailable(pluginName: string) {
  return isNativeApp() && Capacitor.isPluginAvailable(pluginName);
}

export function getNativePlatform() {
  return Capacitor.getPlatform();
}

export function isIOSApp() {
  return getNativePlatform() === "ios";
}

export function isAndroidApp() {
  return getNativePlatform() === "android";
}
