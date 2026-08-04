export const WORKOUT_PHOTO_MAX_FILE_SIZE = 15 * 1024 * 1024;
export const WORKOUT_PHOTO_MAX_COUNT = 10;
export const WORKOUT_PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";
export const WORKOUT_PHOTO_MAX_EDGE = 2048;
export const WORKOUT_PHOTO_WEBP_QUALITY = 0.86;

export function getWorkoutPhotoKey(userId: string, workoutId: number) {
  const owner = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  return `users/${owner}/workouts/${workoutId}/${crypto.randomUUID()}.webp`;
}

export function isWorkoutPhotoKey(key: string) {
  return /^users\/[A-Za-z0-9_-]+\/workouts\/\d+\/[0-9a-f-]+\.webp$/i.test(key);
}

export function isWebpBytes(bytes: Uint8Array) {
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function validateCompressedWorkoutPhoto(file: { name: string; type: string; size: number }, bytes: Uint8Array) {
  if (!file.name.toLowerCase().endsWith(".webp") || file.type.toLowerCase() !== "image/webp") return { success: false as const, error: "The compressed upload must be a WebP file." };
  if (!file.size || !bytes.length) return { success: false as const, error: "The compressed image is empty." };
  if (!isWebpBytes(bytes)) return { success: false as const, error: "The uploaded image signature does not match WebP." };
  const dimensions = getWebpDimensions(bytes);
  if (!dimensions) return { success: false as const, error: "The WebP image could not be decoded." };
  return { success: true as const, dimensions };
}

/** Reads dimensions from a validated WebP container without trusting client fields. */
export function getWebpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8 ") {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}
