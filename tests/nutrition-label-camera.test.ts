import assert from "node:assert/strict";
import test from "node:test";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import {
  createNativeNutritionLabelPhotoAcquirer,
  isNativePhotoCancellation,
} from "@/lib/native/nutrition-label-camera";

test("native camera and photos requests call the Capacitor Camera API and return the same File shape", async () => {
  const calls: Array<Parameters<typeof Camera.getPhoto>[0]> = [];
  const acquire = createNativeNutritionLabelPhotoAcquirer({
    async getPhoto(options) {
      calls.push(options);
      return {
        webPath: "https://image.test/nutrition-label.jpeg",
        format: "jpeg",
        saved: false,
      };
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Blob(["nutrition-label"], { type: "image/jpeg" }));
  try {
    const [cameraFile, galleryFile] = await Promise.all([
      acquire("camera"),
      acquire("gallery"),
    ]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].source, CameraSource.Camera);
    assert.equal(calls[1].source, CameraSource.Photos);
    assert.equal(calls[0].resultType, CameraResultType.Uri);
    assert.equal(cameraFile.type, "image/jpeg");
    assert.equal(galleryFile.type, "image/jpeg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native photo cancellation is safely distinguishable from an acquisition failure", () => {
  assert.equal(isNativePhotoCancellation(new Error("User cancelled photos app")), true);
  assert.equal(isNativePhotoCancellation(new Error("Camera permission denied")), false);
});
