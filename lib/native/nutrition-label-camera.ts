import {
  Camera,
  CameraResultType,
  CameraSource,
  type Photo,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export type NutritionLabelPhotoSource = "camera" | "gallery";

export class NativePhotoAcquisitionError extends Error {}
export class NativePhotoPreparationError extends Error {}

export function canAcquireNativeNutritionLabelPhoto() {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera")
  );
}

export function isNativePhotoCancellation(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return /cancel(?:led|ed)?|user.*cancel/i.test(message);
}

function nativePhotoToFile(photo: Photo) {
  if (!photo.base64String)
    throw new NativePhotoPreparationError("The selected photo could not be read.");
  const binary = atob(photo.base64String);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  // Capacitor Camera normalizes iOS capture and Photos output to JPEG. Keeping
  // this explicit avoids passing HEIC MIME types to the Vision endpoint.
  return new File([bytes], "nutrition-label.jpeg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

type CameraPhotoApi = Pick<typeof Camera, "getPhoto">;

/**
 * Uses the native Capacitor Camera bridge. This must remain separate from the
 * WebView file-input fallback: programmatic file-input clicks are unreliable
 * in an installed iOS app after another native controller was dismissed. Base64
 * also avoids fetching a cross-scheme capacitor:// URI from WKWebView.
 */
export function createNativeNutritionLabelPhotoAcquirer(camera: CameraPhotoApi) {
  return async function acquireNativeNutritionLabelPhoto(
    source: NutritionLabelPhotoSource
  ) {
    let photo: Photo;
    try {
      photo = await camera.getPhoto({
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Base64,
        quality: 90,
        width: 2400,
        correctOrientation: true,
        saveToGallery: false,
      });
    } catch (reason) {
      if (isNativePhotoCancellation(reason)) throw reason;
      throw new NativePhotoAcquisitionError(
        reason instanceof Error ? reason.message : "Native photo capture failed."
      );
    }
    try {
      return nativePhotoToFile(photo);
    } catch (reason) {
      if (reason instanceof NativePhotoPreparationError) throw reason;
      throw new NativePhotoPreparationError(
        reason instanceof Error ? reason.message : "The selected photo could not be prepared."
      );
    }
  };
}

export const acquireNativeNutritionLabelPhoto =
  createNativeNutritionLabelPhotoAcquirer(Camera);
