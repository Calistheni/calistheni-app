import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse, parsePositiveInteger } from "@/lib/api-response";
import { getDatabaseSessionFromRequest } from "@/lib/auth/database-session";
import { prisma } from "@/lib/prisma";
import { isWorkoutPhotoKeyForWorkout } from "@/lib/workout-photo";
import { deleteWorkoutPhotoObject } from "@/lib/workout-photo-storage";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const userId = (await getDatabaseSessionFromRequest(request))?.userId;
  if (!userId) return createJsonErrorResponse("Unauthorized", 401);
  const { id, photoId } = await params; const workoutId = parsePositiveInteger(id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  const photo = await prisma.workoutPhoto.findFirst({ where: { id: photoId, workoutId, userId, workout: { userId } }, select: { id: true, storageKey: true } });
  if (!photo || !isWorkoutPhotoKeyForWorkout(photo.storageKey, userId, workoutId)) {
    return createJsonErrorResponse("Workout photo not found.", 404);
  }
  try { await deleteWorkoutPhotoObject(photo.storageKey); await prisma.workoutPhoto.delete({ where: { id: photo.id } }); return NextResponse.json({ success: true }); }
  catch (error) { console.error("Workout photo deletion failed", error); return createInternalServerErrorResponse(); }
}
