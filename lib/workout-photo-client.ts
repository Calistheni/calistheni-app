"use client";
import { WORKOUT_PHOTO_MAX_EDGE, WORKOUT_PHOTO_WEBP_QUALITY } from "@/lib/workout-photo";
export async function isWebpBlob(blob: Blob) { const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer()); return b.length === 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"; }
export async function compressWorkoutPhoto(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("This image format is not supported on this device.");
  try { const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); const ratio = Math.min(1, WORKOUT_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio)); canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WORKOUT_PHOTO_WEBP_QUALITY)); if (blob && blob.size && await isWebpBlob(blob)) return new File([blob], `${crypto.randomUUID()}.webp`, { type: "image/webp", lastModified: Date.now() }); } catch { /* server fallback below */ }
  // Preserve genuine original bytes for the authenticated Node/Sharp fallback.
  return file;
}
