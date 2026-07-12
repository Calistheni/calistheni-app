import { z } from "zod";
import { CREATABLE_EXERCISE_TRACKING_TYPES } from "@/lib/exercises";
import {
  EXERCISE_MUSCLE_GROUPS,
  normalizeSecondaryMuscles,
} from "@/lib/exercise-muscles";

const trackingTypeSchema = z.enum(CREATABLE_EXERCISE_TRACKING_TYPES);
const muscleSchema = z.enum(EXERCISE_MUSCLE_GROUPS);
const secondaryMusclesSchema = z.array(muscleSchema).max(8).default([]);

const baseExerciseSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    muscle: muscleSchema,
    secondaryMuscles: secondaryMusclesSchema,
    trackingType: trackingTypeSchema,
    bodyweightLoadFactor: z.number().positive().max(5).nullable().optional(),
  })
  .transform((value) => ({
    ...value,
    secondaryMuscles: normalizeSecondaryMuscles(
      value.muscle,
      value.secondaryMuscles
    ),
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
    muscle: muscleSchema,
    secondaryMuscles: secondaryMusclesSchema,
    trackingType: trackingTypeSchema,
    bodyweightLoadFactor: z.number().positive().max(5).nullable().optional(),
    thumbnailUrl: z.string().url().max(1000),
    videoUrl: z.string().url().max(1000).nullable().optional(),
  })
  .transform((value) => ({
    ...value,
    secondaryMuscles: normalizeSecondaryMuscles(
      value.muscle,
      value.secondaryMuscles
    ),
    bodyweightLoadFactor:
      value.trackingType === "BODYWEIGHT_REPS" ||
      value.trackingType === "WEIGHTED_BODYWEIGHT"
        ? value.bodyweightLoadFactor ?? 1
        : null,
    videoUrl: value.videoUrl ?? null,
  }));
