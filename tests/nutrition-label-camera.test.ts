import assert from "node:assert/strict";
import test from "node:test";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import {
  createNativeNutritionLabelPhotoAcquirer,
  isNativePhotoCancellation,
  NativePhotoAcquisitionError,
  NativePhotoPreparationError,
} from "@/lib/native/nutrition-label-camera";

test("native camera and photos requests call the Capacitor Camera API and return the same File shape", async () => {
  const calls: Array<Parameters<typeof Camera.getPhoto>[0]> = [];
  const acquire = createNativeNutritionLabelPhotoAcquirer({
    async getPhoto(options) {
      calls.push(options);
      return {
        base64String: Buffer.from("nutrition-label").toString("base64"),
        format: "jpeg",
        saved: false,
      };
    },
  });
  const [cameraFile, galleryFile] = await Promise.all([
    acquire("camera"),
    acquire("gallery"),
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].source, CameraSource.Camera);
  assert.equal(calls[1].source, CameraSource.Photos);
  assert.equal(calls[0].resultType, CameraResultType.Base64);
  assert.equal(cameraFile.type, "image/jpeg");
  assert.equal(galleryFile.type, "image/jpeg");
});

test("native label acquisition does not fetch a Capacitor URI and classifies acquisition versus preparation failures", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("URI fetch should not happen");
  };
  try {
    const valid = createNativeNutritionLabelPhotoAcquirer({
      async getPhoto() {
        return {
          base64String: Buffer.from("jpeg").toString("base64"),
          format: "jpeg",
          saved: false,
        };
      },
    });
    await valid("camera");
    assert.equal(fetchCalls, 0);

    const acquisitionFailure = createNativeNutritionLabelPhotoAcquirer({
      async getPhoto() {
        throw new Error("Camera permission denied");
      },
    });
    await assert.rejects(
      () => acquisitionFailure("camera"),
      NativePhotoAcquisitionError
    );

    const preparationFailure = createNativeNutritionLabelPhotoAcquirer({
      async getPhoto() {
        return { format: "jpeg", saved: false };
      },
    });
    await assert.rejects(
      () => preparationFailure("gallery"),
      NativePhotoPreparationError
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native photo cancellation is safely distinguishable from an acquisition failure", () => {
  assert.equal(isNativePhotoCancellation(new Error("User cancelled photos app")), true);
  assert.equal(isNativePhotoCancellation(new Error("Camera permission denied")), false);
});
