import { NextResponse } from "next/server";
import sharp from "sharp";
import { parsePositiveInteger, createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { getWorkoutPhotoKey, validateCompressedWorkoutPhoto, WORKOUT_PHOTO_MAX_COUNT, WORKOUT_PHOTO_MAX_FILE_SIZE } from "@/lib/workout-photo";
import { detectParkPhotoFamily } from "@/lib/park-photo-file";
import { deleteWorkoutPhotoObject, putWorkoutPhoto } from "@/lib/workout-photo-storage";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const workoutId = parsePositiveInteger((await params).id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  if (Number(request.headers.get("content-length") ?? 0) > WORKOUT_PHOTO_MAX_FILE_SIZE + 1024 * 1024) return createJsonErrorResponse("Image must be 15 MB or smaller.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return createJsonErrorResponse("Unable to read the uploaded photo.", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return createJsonErrorResponse("No photo was uploaded.", 400);
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const sourceFamily = detectParkPhotoFamily(sourceBytes);
  if (!sourceFamily || !["jpeg", "png", "webp"].includes(sourceFamily)) return createJsonErrorResponse("This photo format is not supported.", 400);
  let bytes = sourceBytes;
  let normalizedFile = file;
  // Safari/WebViews may be unable to encode WebP client-side. Convert the
  // validated original in Node and store only the resulting WebP.
  if (sourceFamily !== "webp") {
    try {
      bytes = new Uint8Array(await sharp(sourceBytes, { failOn: "error" }).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer());
      normalizedFile = new File([bytes], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
    } catch { return createJsonErrorResponse("This photo could not be processed. Try another image.", 400); }
  }
  const validated = validateCompressedWorkoutPhoto(normalizedFile, bytes);
  if (!validated.success) return createJsonErrorResponse(validated.error, 400);
  const { dimensions } = validated;
  try {
    if (process.env.NODE_ENV === "development") console.info("Workout photo upload request reached API", { workoutId, userId, name: file.name, contentType: file.type, bytes: bytes.byteLength });
    const workout = await prisma.workout.findFirst({ where: { id: workoutId, userId }, select: { id: true, completedAt: true, _count: { select: { photos: true } } } });
    if (!workout) return createJsonErrorResponse("Workout not found.", 404);
    if (!workout.completedAt) return createJsonErrorResponse("Photos can be added after a workout is completed.", 400);
    if (workout._count.photos >= WORKOUT_PHOTO_MAX_COUNT) return createJsonErrorResponse("A workout can have up to 10 photos.", 400);
    const storageKey = getWorkoutPhotoKey(userId, workoutId);
    if (process.env.NODE_ENV === "development") console.info("Workout photo R2 upload starting", { bucket: process.env.PARK_PHOTO_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME, storageKey, contentType: "image/webp" });
    await putWorkoutPhoto(storageKey, bytes);
    try {
      const photo = await prisma.workoutPhoto.create({ data: { workoutId, userId, storageKey, width: dimensions.width, height: dimensions.height, fileSizeBytes: bytes.byteLength, mimeType: "image/webp", originalFileName: file.name } });
      if (process.env.NODE_ENV === "development") console.info("Workout photo compressed", { workoutId, originalName: file.name, compressedBytes: bytes.byteLength, dimensions });
      return NextResponse.json({ photo }, { status: 201 });
    } catch (error) { await deleteWorkoutPhotoObject(storageKey).catch(() => undefined); throw error; }
  } catch (error) { console.error("Workout photo upload failed", error); return createInternalServerErrorResponse(); }
}
