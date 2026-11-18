import sharp from "sharp";

/** Normalize every accepted workout image and remove embedded metadata. */
export async function sanitizeWorkoutPhotoImage(bytes: Uint8Array) {
  return sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
}
