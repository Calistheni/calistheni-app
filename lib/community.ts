import { prisma } from "@/lib/prisma";
import { communityUserWhereForViewer } from "@/lib/moderation";
export { displayUsername, relativeTime } from "@/lib/community-ui";

export const publicCommunityWorkoutWhere = {
  visibility: "PUBLIC" as const,
  completedAt: { not: null },
  moderationHiddenAt: null,
  user: { is: { deletedAt: null, communityRestrictedAt: null } },
  exercises: { none: { exercise: { createdByUserId: { not: null } } } },
};

export function publicCommunityWorkoutWhereForViewer(viewerId: string) {
  return {
    visibility: "PUBLIC" as const,
    completedAt: { not: null },
    moderationHiddenAt: null,
    user: { is: communityUserWhereForViewer(viewerId) },
    exercises: { none: { exercise: { createdByUserId: { not: null } } } },
  };
}

export async function getCommunityWorkoutForViewer(
  workoutId: number,
  viewerId: string
) {
  return prisma.workout.findFirst({
    where: {
      id: workoutId,
      OR: [{ userId: viewerId }, publicCommunityWorkoutWhereForViewer(viewerId)],
    },
    select: { id: true, userId: true, visibility: true, completedAt: true },
  });
}
