import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getWorkoutPhotoObject } from "@/lib/workout-photo-storage";

/** Streams only photos belonging to an owner-visible or public workout. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const session = await auth(); const { id, photoId } = await params; const workoutId = parsePositiveInteger(id);
  if (workoutId === null) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const photo = await prisma.workoutPhoto.findFirst({ where: { id: photoId, workoutId, workout: { OR: [{ visibility: "PUBLIC" }, ...(session?.user?.id ? [{ userId: session.user.id }] : [])] } }, select: { storageKey: true, workout: { select: { visibility: true } } } });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const object = await getWorkoutPhotoObject(photo.storageKey);
    if (!object.Body || !("transformToWebStream" in object.Body)) return NextResponse.json({ error: "Photo unavailable." }, { status: 404 });
    return new NextResponse(object.Body.transformToWebStream(), { headers: { "Content-Type": "image/webp", "Cache-Control": photo.workout.visibility === "PUBLIC" ? "public, max-age=86400" : "private, no-store" } });
  } catch { return NextResponse.json({ error: "Photo unavailable." }, { status: 404 }); }
}
