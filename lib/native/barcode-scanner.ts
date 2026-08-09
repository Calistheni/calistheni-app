"use client";

import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
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

let listener: PluginListenerHandle | null = null;
let active = false;
let browserControls: { stop: () => void } | null = null;
let browserStream: MediaStream | null = null;
let browserTorchOn = false;

export function canUseNativeLiveBarcodeScanner() {
  return Capacitor.isNativePlatform();
}

export function usesNativeBarcodeCameraLayer() {
  // The installed ML Kit plugin is compiled into Android. iOS uses the
  // WebView's secure getUserMedia path so this SPM-based app does not need a
  // second native dependency manager just for ML Kit.
  return Capacitor.getPlatform() === "android";
}

export async function startNativeLiveBarcodeScanner(
  onBarcode: (value: string) => void
): Promise<NativeBarcodeScannerStart> {
  if (!usesNativeBarcodeCameraLayer()) return { ok: false, reason: "unsupported" };
  const support = await BarcodeScanner.isSupported().catch(() => ({ supported: false }));
  if (!support.supported) return { ok: false, reason: "unsupported" };
  let permission = await BarcodeScanner.checkPermissions().catch(() => ({ camera: "denied" as const }));
  if (permission.camera === "prompt" || permission.camera === "prompt-with-rationale") {
    permission = await BarcodeScanner.requestPermissions().catch(() => ({ camera: "denied" as const }));
  }
  if (permission.camera !== "granted" && permission.camera !== "limited") return { ok: false, reason: "denied" };

  document.documentElement.classList.add("native-barcode-scanner-active");
  document.body.classList.add("native-barcode-scanner-active");
  active = true;
  listener = await BarcodeScanner.addListener("barcodesScanned", ({ barcodes }) => {
    if (!active) return;
    const value = barcodes.map((barcode) => barcode.displayValue.replaceAll(/\s/g, "")).find((candidate) => /^\d{8,14}$/.test(candidate));
    if (value) onBarcode(value);
  });
  try {
    await BarcodeScanner.startScan({ formats: [...NUTRITION_BARCODE_FORMATS], lensFacing: LensFacing.Back });
    const torch = await BarcodeScanner.isTorchAvailable().catch(() => ({ available: false }));
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
    await BarcodeScanner.stopScan().catch(() => undefined);
  }
  browserControls?.stop();
  browserControls = null;
  browserStream?.getTracks().forEach((track) => track.stop());
  browserStream = null;
  browserTorchOn = false;
}

export async function toggleNativeBarcodeTorch() {
  if (!usesNativeBarcodeCameraLayer()) {
    const track = browserStream?.getVideoTracks()[0] as
      | (MediaStreamTrack & {
          getCapabilities?: () => { torch?: boolean };
          applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
        })
      | undefined;
    const capabilities = track?.getCapabilities?.() as
      | { torch?: boolean }
      | undefined;
    if (!track || !capabilities?.torch) {
      return { enabled: false };
    }
    browserTorchOn = !browserTorchOn;
    await track.applyConstraints({ advanced: [{ torch: browserTorchOn } as MediaTrackConstraintSet] });
    return { enabled: browserTorchOn };
  }
  await BarcodeScanner.toggleTorch();
  return BarcodeScanner.isTorchEnabled();
}

export async function openNativeBarcodeSettings() {
  if (!usesNativeBarcodeCameraLayer()) return;
  await BarcodeScanner.openSettings();
}

export async function signalNativeBarcodeSuccess() {
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

export async function startWebViewLiveBarcodeScanner(
  video: HTMLVideoElement,
  onBarcode: (value: string) => void
): Promise<NativeBarcodeScannerStart> {
  if (!canUseNativeLiveBarcodeScanner()) return { ok: false, reason: "unsupported" };
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    browserControls = await reader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      video,
      (result) => {
        const value = result?.getText().replaceAll(/\s/g, "");
        if (value && /^\d{8,14}$/.test(value)) onBarcode(value);
      }
    );
    browserStream = video.srcObject instanceof MediaStream ? video.srcObject : null;
    const track = browserStream?.getVideoTracks()[0] as
      | (MediaStreamTrack & { getCapabilities?: () => { torch?: boolean } })
      | undefined;
    return {
      ok: true,
      torchAvailable: Boolean(
        (track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch
      ),
    };
  } catch (error) {
    await stopNativeLiveBarcodeScanner();
    return {
      ok: false,
      reason:
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "denied"
          : "unavailable",
    };
  }
}
