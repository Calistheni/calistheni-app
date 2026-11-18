import sharp from "sharp";

/** Re-encode public park photos so source EXIF/XMP metadata is never stored. */
export async function sanitizeParkPhotoImage(bytes: Uint8Array) {
  return sharp(bytes)
    .rotate()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
