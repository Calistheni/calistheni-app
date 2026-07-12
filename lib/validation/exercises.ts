import { z } from "zod";
import { CREATABLE_EXERCISE_TRACKING_TYPES } from "@/lib/exercises";

const trackingTypeSchema = z.enum(CREATABLE_EXERCISE_TRACKING_TYPES);

const baseExerciseSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    muscle: z.string().trim().min(2).max(80),
    trackingType: trackingTypeSchema,
    bodyweightLoadFactor: z.number().positive().max(5).nullable().optional(),
  })
  .transform((value) => ({
    ...value,
    bodyweightLoadFactor:
      value.trackingType === "BODYWEIGHT_REPS" ||
      value.trackingType === "WEIGHTED_BODYWEIGHT"
        ? value.bodyweightLoadFactor ?? 1
        : null,
  }));

export const customExerciseMutationSchema = baseExerciseSchema;

export const adminExerciseCreationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    muscle: z.string().trim().min(2).max(80),
    trackingType: trackingTypeSchema,
    bodyweightLoadFactor: z.number().positive().max(5).nullable().optional(),
    thumbnailUrl: z.string().url().max(1000),
    videoUrl: z.string().url().max(1000).nullable().optional(),
  })
  .transform((value) => ({
    ...value,
    bodyweightLoadFactor:
      value.trackingType === "BODYWEIGHT_REPS" ||
      value.trackingType === "WEIGHTED_BODYWEIGHT"
        ? value.bodyweightLoadFactor ?? 1
        : null,
    videoUrl: value.videoUrl ?? null,
  }));
