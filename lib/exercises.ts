import { createExerciseSlug } from "@/lib/exercise-slug";
import type { ExerciseTrackingType } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const CREATABLE_EXERCISE_TRACKING_TYPES = [
  "BODYWEIGHT_REPS",
  "WEIGHTED_BODYWEIGHT",
  "EXTERNAL_WEIGHT",
  "DURATION",
] as const satisfies readonly ExerciseTrackingType[];

export type CreatableExerciseTrackingType =
  (typeof CREATABLE_EXERCISE_TRACKING_TYPES)[number];

export function usesBodyweightLoadFactor(
  trackingType: CreatableExerciseTrackingType
) {
  return (
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT"
  );
}

export function normalizeBodyweightLoadFactor(
  trackingType: CreatableExerciseTrackingType,
  value: number | null | undefined
) {
  return usesBodyweightLoadFactor(trackingType) ? value ?? 1 : null;
}

export async function createUniqueExerciseSlug(name: string) {
  const baseSlug = createExerciseSlug(name) || "exercise";
  let slug = baseSlug;
  let suffix = 2;

  while (
    await prisma.exercise.findUnique({ where: { slug }, select: { id: true } })
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
