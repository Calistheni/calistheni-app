import { prisma } from "@/lib/prisma";
export { displayUsername, relativeTime } from "@/lib/community-ui";

export const publicCommunityWorkoutWhere = {
  visibility: "PUBLIC" as const,
  completedAt: { not: null },
  exercises: { none: { exercise: { createdByUserId: { not: null } } } },
};

export async function getCommunityWorkoutForViewer(
  workoutId: number,
  viewerId: string
) {
  return prisma.workout.findFirst({
    where: {
      id: workoutId,
      OR: [{ userId: viewerId }, publicCommunityWorkoutWhere],
    },
    select: { id: true, userId: true, visibility: true, completedAt: true },
  });
}
