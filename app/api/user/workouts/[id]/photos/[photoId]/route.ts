import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse, parsePositiveInteger } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { deleteWorkoutPhotoObject } from "@/lib/workout-photo-storage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  const { id, photoId } = await params; const workoutId = parsePositiveInteger(id);
  if (workoutId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  const photo = await prisma.workoutPhoto.findFirst({ where: { id: photoId, workoutId, userId }, select: { id: true, storageKey: true } });
  if (!photo) return createJsonErrorResponse("Workout photo not found.", 404);
  try { await deleteWorkoutPhotoObject(photo.storageKey); await prisma.workoutPhoto.delete({ where: { id: photo.id } }); return NextResponse.json({ success: true }); }
  catch (error) { console.error("Workout photo deletion failed", error); return createInternalServerErrorResponse(); }
}
