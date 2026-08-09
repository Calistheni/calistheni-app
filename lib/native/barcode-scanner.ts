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
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" };

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
let listener: PluginListenerHandle | null = null;
let active = false;

export function canUseNativeLiveBarcodeScanner() {
  return Capacitor.isNativePlatform();
}

export function usesNativeBarcodeCameraLayer() {
  return Capacitor.isNativePlatform();
}

export async function startNativeLiveBarcodeScanner(
  onBarcode: (value: string) => void
): Promise<NativeBarcodeScannerStart> {
  if (!usesNativeBarcodeCameraLayer()) return { ok: false, reason: "unsupported" };
  const scanner = Capacitor.getPlatform() === "ios" ? IOSBarcodeScanner : BarcodeScanner;
  const support = await scanner.isSupported().catch(() => ({ supported: false }));
  if (!support.supported) return { ok: false, reason: "unsupported" };
  let permission = await scanner.checkPermissions().catch(() => ({ camera: "denied" as const }));
  if (permission.camera === "prompt" || permission.camera === "prompt-with-rationale") {
    permission = await scanner.requestPermissions().catch(() => ({ camera: "denied" as const }));
  }
  if (permission.camera !== "granted" && permission.camera !== "limited") return { ok: false, reason: "denied" };

  document.documentElement.classList.add("native-barcode-scanner-active");
  document.body.classList.add("native-barcode-scanner-active");
  active = true;
  listener = await scanner.addListener("barcodesScanned", ({ barcodes }) => {
    if (!active) return;
    const value = barcodes.map((barcode) => barcode.displayValue.replaceAll(/\s/g, "")).find((candidate) => /^\d{8,14}$/.test(candidate));
    if (value) onBarcode(value);
  });
  try {
    await scanner.startScan({ formats: [...NUTRITION_BARCODE_FORMATS], lensFacing: LensFacing.Back });
    const torch = await scanner.isTorchAvailable().catch(() => ({ available: false }));
    return { ok: true, torchAvailable: torch.available };
  } catch {
    await stopNativeLiveBarcodeScanner();
    return { ok: false, reason: "unavailable" };
  }
}

export async function stopNativeLiveBarcodeScanner() {
  active = false;
  document.documentElement.classList.remove("native-barcode-scanner-active");
  document.body.classList.remove("native-barcode-scanner-active");
  await listener?.remove().catch(() => undefined);
  listener = null;
  if (usesNativeBarcodeCameraLayer()) {
    const scanner = Capacitor.getPlatform() === "ios" ? IOSBarcodeScanner : BarcodeScanner;
    await scanner.stopScan().catch(() => undefined);
  }
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
