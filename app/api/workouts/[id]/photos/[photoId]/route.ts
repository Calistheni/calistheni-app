import { NextResponse } from "next/server";
import { parsePositiveInteger } from "@/lib/api-response";
import { getDatabaseSessionFromRequest } from "@/lib/auth/database-session";
import { prisma } from "@/lib/prisma";
import { workoutPhotoWhere, WORKOUT_PHOTO_RESPONSE_HEADERS as headers } from "@/lib/workout-photo-access";
import { getWorkoutPhotoObject } from "@/lib/workout-photo-storage";

export const dynamic = "force-dynamic";

/** Authorize every request before opening the object stream. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  const workoutId = parsePositiveInteger(id);
  if (workoutId === null) return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  const session = await getDatabaseSessionFromRequest(request);

  const photo = await prisma.workoutPhoto.findFirst({
    where: workoutPhotoWhere(workoutId, photoId, session?.userId),
    select: { storageKey: true },
  });
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404, headers });

  try {
    const object = await getWorkoutPhotoObject(photo.storageKey);
    if (object.Body && "transformToWebStream" in object.Body) {
      return new NextResponse(object.Body.transformToWebStream(), {
        headers: { ...headers, "Content-Type": "image/webp" },
      });
    }
  } catch {
    // Avoid revealing storage configuration or an object key.
  }
  return NextResponse.json({ error: "Photo unavailable." }, { status: 404, headers });
}
