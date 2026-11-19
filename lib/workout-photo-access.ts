import { communityUserWhereForViewer } from "@/lib/moderation";
import type { Prisma } from "@/lib/generated/prisma/client";

export const WORKOUT_PHOTO_RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };

export function workoutPhotoWhere(workoutId: number, photoId: string, viewerId?: string): Prisma.WorkoutPhotoWhereInput {
  return {
    id: photoId,
    workoutId,
    workout: {
      moderationHiddenAt: null,
      OR: [
        {
          visibility: "PUBLIC",
          user: { is: viewerId ? communityUserWhereForViewer(viewerId) : { deletedAt: null, communityRestrictedAt: null } },
        },
        ...(viewerId ? [{ userId: viewerId, user: { is: { deletedAt: null } } }] : []),
      ],
    },
  };
}
