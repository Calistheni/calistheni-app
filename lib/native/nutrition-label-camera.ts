import {
  Camera,
  CameraResultType,
  CameraSource,
  type Photo,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export type NutritionLabelPhotoSource = "camera" | "gallery";

export function canAcquireNativeNutritionLabelPhoto() {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera")
  );
}

export function isNativePhotoCancellation(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return /cancel(?:led|ed)?|user.*cancel/i.test(message);
}

async function nativePhotoToFile(photo: Photo) {
  const source = photo.webPath ?? photo.path;
  if (!source) throw new Error("The selected photo could not be read.");

  const response = await fetch(source);
  if (!response.ok) throw new Error("The selected photo could not be read.");
  const blob = await response.blob();
  const format = photo.format?.toLowerCase() || "jpeg";
  const type = /^image\//.test(blob.type) ? blob.type : `image/${format}`;
  return new File([blob], `nutrition-label.${format}`, {
    type,
    lastModified: Date.now(),
  });
}

type CameraPhotoApi = Pick<typeof Camera, "getPhoto">;

/**
 * Uses the native Capacitor Camera bridge. This must remain separate from the
 * WebView file-input fallback: programmatic file-input clicks are unreliable
 * in an installed iOS app after another native controller was dismissed.
 */
export function createNativeNutritionLabelPhotoAcquirer(camera: CameraPhotoApi) {
  return async function acquireNativeNutritionLabelPhoto(
    source: NutritionLabelPhotoSource
  ) {
    const photo = await camera.getPhoto({
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      width: 2400,
      correctOrientation: true,
      saveToGallery: false,
    });
    return nativePhotoToFile(photo);
  };
}

export const acquireNativeNutritionLabelPhoto =
  createNativeNutritionLabelPhotoAcquirer(Camera);
