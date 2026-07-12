import type { Prisma } from "@/lib/generated/prisma/client";

export function exerciseVisibilityWhere(
  userId: string | null | undefined
): Prisma.ExerciseWhereInput {
  return userId
    ? { OR: [{ createdByUserId: null }, { createdByUserId: userId }] }
    : { createdByUserId: null };
}

export function canAccessExercise(
  createdByUserId: string | null,
  userId: string | null | undefined
) {
  return createdByUserId === null || createdByUserId === userId;
}
