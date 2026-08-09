"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  BarcodeFormat,
  BarcodeScanner,
  LensFacing,
} from "@capacitor-mlkit/barcode-scanning";

export const NUTRITION_BARCODE_FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.Itf,
] as const;

export type NativeBarcodeScannerStart =
  | { ok: true; torchAvailable: boolean }
  | {
      ok: false;
      reason: "unsupported" | "denied" | "unavailable" | "cancelled";
      detail?: string;
    };

type IOSBarcodeScannerPlugin = {
  isSupported(): Promise<{ supported: boolean }>;
  checkPermissions(): Promise<{ camera: string }>;
  requestPermissions(): Promise<{ camera: string }>;
  startScan(options: { formats: string[]; lensFacing: string }): Promise<void>;
  stopScan(): Promise<void>;
  isTorchAvailable(): Promise<{ available: boolean }>;
  toggleTorch(): Promise<void>;
  isTorchEnabled(): Promise<{ enabled: boolean }>;
  openSettings(): Promise<void>;
  addListener(
    eventName: "barcodesScanned",
    listenerFunc: (event: { barcodes: Array<{ displayValue: string }> }) => void
  ): Promise<PluginListenerHandle>;
};
const IOSBarcodeScanner = registerPlugin<IOSBarcodeScannerPlugin>("NutritionBarcodeScanner");
const IOS_SCANNER_PLUGIN_NAME = "NutritionBarcodeScanner";
const ANDROID_SCANNER_PLUGIN_NAME = "BarcodeScanner";
let listener: PluginListenerHandle | null = null;
let active = false;
let startAttempt = 0;

export type NativeBarcodeScannerAvailability = {
  nativePlatform: boolean;
  platform: string;
  pluginName: string | null;
  pluginAvailable: boolean;
};

export function getNativeBarcodeScannerAvailability(): NativeBarcodeScannerAvailability {
  const nativePlatform = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const pluginName =
    platform === "ios"
      ? IOS_SCANNER_PLUGIN_NAME
      : platform === "android"
        ? ANDROID_SCANNER_PLUGIN_NAME
        : null;
  return {
    nativePlatform,
    platform,
    pluginName,
    pluginAvailable:
      nativePlatform && pluginName !== null && Capacitor.isPluginAvailable(pluginName),
  };
}

function debugScanner(event: string, details: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "development") return;
  const availability = getNativeBarcodeScannerAvailability();
  console.info("[BarcodeScanner]", {
    event,
    platform: availability.platform,
    isNativePlatform: availability.nativePlatform,
    pluginName: availability.pluginName,
    pluginAvailable: availability.pluginAvailable,
    ...details,
  });
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function canUseNativeLiveBarcodeScanner() {
  return getNativeBarcodeScannerAvailability().pluginAvailable;
}

export function usesNativeBarcodeCameraLayer() {
  return canUseNativeLiveBarcodeScanner();
}

export async function startNativeLiveBarcodeScanner(
  onBarcode: (value: string) => void,
  signal?: AbortSignal
): Promise<NativeBarcodeScannerStart> {
  const attempt = ++startAttempt;
  const wasCancelled = () => signal?.aborted || attempt !== startAttempt;
  const availability = getNativeBarcodeScannerAvailability();
  debugScanner("startup requested", { startScanCalled: false });
  if (!availability.nativePlatform) {
    return { ok: false, reason: "unsupported", detail: "Not running in Capacitor." };
  }
  if (!availability.pluginAvailable) {
    return {
      ok: false,
      reason: "unsupported",
      detail: `The ${availability.pluginName ?? "barcode scanner"} native plugin is not registered.`,
    };
  }
  const scanner = Capacitor.getPlatform() === "ios" ? IOSBarcodeScanner : BarcodeScanner;
  let support: { supported: boolean };
  try {
    support = await scanner.isSupported();
  } catch (error) {
    debugScanner("isSupported failed", { error: errorDetail(error) });
    return { ok: false, reason: "unavailable", detail: errorDetail(error) };
  }
  if (wasCancelled()) return { ok: false, reason: "cancelled" };
  if (!support.supported) {
    debugScanner("native scanner unsupported");
    return { ok: false, reason: "unsupported", detail: "The device does not support live barcode scanning." };
  }
  let permission: { camera: string };
  try {
    permission = await scanner.checkPermissions();
  } catch (error) {
    debugScanner("checkPermissions failed", { error: errorDetail(error) });
    return { ok: false, reason: "unavailable", detail: errorDetail(error) };
  }
  if (wasCancelled()) return { ok: false, reason: "cancelled" };
  debugScanner("permission checked", { permissionState: permission.camera });
  if (permission.camera === "prompt" || permission.camera === "prompt-with-rationale") {
    try {
      permission = await scanner.requestPermissions();
    } catch (error) {
      debugScanner("requestPermissions failed", { error: errorDetail(error) });
      return { ok: false, reason: "unavailable", detail: errorDetail(error) };
    }
    debugScanner("permission requested", { permissionState: permission.camera });
  }
  if (wasCancelled()) return { ok: false, reason: "cancelled" };
  if (permission.camera !== "granted" && permission.camera !== "limited") {
    return { ok: false, reason: "denied" };
  }

  document.documentElement.classList.add("native-barcode-scanner-active");
  document.body.classList.add("native-barcode-scanner-active");
  active = true;
  try {
    if (wasCancelled()) return { ok: false, reason: "cancelled" };
    listener = await scanner.addListener("barcodesScanned", ({ barcodes }) => {
      if (!active) return;
      const value = barcodes
        .map((barcode) => barcode.displayValue.replaceAll(/\s/g, ""))
        .find((candidate) => /^\d{8,14}$/.test(candidate));
      if (value) {
        debugScanner("native barcode received", { barcodeLength: value.length });
        onBarcode(value);
      }
    });
    if (wasCancelled()) {
      await listener.remove().catch(() => undefined);
      listener = null;
      return { ok: false, reason: "cancelled" };
    }
    debugScanner("listener registered");
    debugScanner("startScan called", { startScanCalled: true });
    await scanner.startScan({ formats: [...NUTRITION_BARCODE_FORMATS], lensFacing: LensFacing.Back });
    const torch = await scanner.isTorchAvailable().catch(() => ({ available: false }));
    debugScanner("startScan result", { started: true, torchAvailable: torch.available });
    return { ok: true, torchAvailable: torch.available };
  } catch (error) {
    debugScanner("startScan result", { started: false, error: errorDetail(error) });
    await stopNativeLiveBarcodeScanner("startup-error");
    return { ok: false, reason: "unavailable", detail: errorDetail(error) };
  }
}

export async function stopNativeLiveBarcodeScanner(reason = "stop-requested") {
  debugScanner("stop requested", { reason });
  startAttempt += 1;
  active = false;
  document.documentElement.classList.remove("native-barcode-scanner-active");
  document.body.classList.remove("native-barcode-scanner-active");
  await listener?.remove().catch(() => undefined);
  listener = null;
  if (usesNativeBarcodeCameraLayer()) {
    const scanner = Capacitor.getPlatform() === "ios" ? IOSBarcodeScanner : BarcodeScanner;
    await scanner.stopScan().catch(() => undefined);
  }
  debugScanner("capture session stopped", { reason });
}

export async function toggleNativeBarcodeTorch() {
  const scanner = Capacitor.getPlatform() === "ios" ? IOSBarcodeScanner : BarcodeScanner;
  await scanner.toggleTorch();
  return scanner.isTorchEnabled();
}

export async function openNativeBarcodeSettings() {
  if (!usesNativeBarcodeCameraLayer()) return;
  const scanner = Capacitor.getPlatform() === "ios" ? IOSBarcodeScanner : BarcodeScanner;
  await scanner.openSettings();
}

export async function signalNativeBarcodeSuccess() {
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}
