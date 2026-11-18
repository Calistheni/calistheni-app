import { Camera, CameraResultType, CameraSource, type Photo } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";

export type NutritionLabelPhotoSource = "camera" | "gallery";

export class NativePhotoAcquisitionError extends Error {}
export class NativePhotoPreparationError extends Error {}

type IOSNutritionPhotoPicker = {
  getPhoto(options: { source: NutritionLabelPhotoSource }): Promise<{
    base64String?: string;
    cancelled?: boolean;
  }>;
};

const IOSNutritionPhotoPicker = registerPlugin<IOSNutritionPhotoPicker>(
  "CalistheniNutritionPhotoPicker"
);

export function canAcquireNativeNutritionLabelPhoto() {
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.getPlatform() === "ios"
    ? Capacitor.isPluginAvailable("CalistheniNutritionPhotoPicker")
    : Capacitor.isPluginAvailable("Camera");
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
  // Native capture and picker output are normalized to JPEG so the Vision
  // endpoint does not receive HEIC MIME types.
  return new File([bytes], "nutrition-label.jpeg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

type CameraPhotoApi = Pick<typeof Camera, "getPhoto">;
type NutritionPhotoPickerApi = Pick<IOSNutritionPhotoPicker, "getPhoto">;

/**
 * Uses native picker bridges. This must remain separate from the WebView
 * file-input fallback: programmatic file-input clicks are unreliable in an
 * installed iOS app after another native controller was dismissed. Base64 also
 * avoids fetching a cross-scheme capacitor:// URI from WKWebView.
 */
export function createNativeNutritionLabelPhotoAcquirer(
  camera: CameraPhotoApi,
  iosPicker?: NutritionPhotoPickerApi
) {
  return async function acquireNativeNutritionLabelPhoto(
    source: NutritionLabelPhotoSource
  ) {
    let photo: Photo;
    try {
      if (iosPicker) {
        const result = await iosPicker.getPhoto({ source });
        if (result.cancelled) throw new Error("User cancelled photos app");
        photo = {
          base64String: result.base64String,
          format: "jpeg",
          saved: false,
        };
      } else {
        photo = await camera.getPhoto({
          source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
          resultType: CameraResultType.Base64,
          quality: 90,
          width: 2400,
          correctOrientation: true,
          saveToGallery: false,
        });
      }
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
  createNativeNutritionLabelPhotoAcquirer(
    Camera,
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"
      ? IOSNutritionPhotoPicker
      : undefined
  );
