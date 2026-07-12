import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  FREE_CUSTOM_EXERCISE_LIMIT,
  hasUnlimitedCustomExercises,
} from "@/lib/custom-exercise-entitlements";
import { createUniqueExerciseSlug } from "@/lib/exercises";
import { prisma } from "@/lib/prisma";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { customExerciseMutationSchema } from "@/lib/validation/exercises";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsed = customExerciseMutationSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Invalid exercise details.",
      parsed.error.flatten().fieldErrors
    );
  }

  try {
    const hasUnlimited = await hasUnlimitedCustomExercises(userId);
    const slug = await createUniqueExerciseSlug(parsed.data.name);
    const exercise = await prisma.$transaction(
      async (tx) => {
        if (!hasUnlimited) {
          const customExerciseCount = await tx.exercise.count({
            where: { createdByUserId: userId },
          });
          if (customExerciseCount >= FREE_CUSTOM_EXERCISE_LIMIT) return null;
        }

        return tx.exercise.create({
          data: {
            id: `custom-${randomUUID()}`,
            slug,
            ...parsed.data,
            createdByUserId: userId,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
    if (!exercise) {
      return NextResponse.json(
        {
          code: "CUSTOM_EXERCISE_LIMIT_REACHED",
          error: `Free accounts can create up to ${FREE_CUSTOM_EXERCISE_LIMIT} custom exercises.`,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(exercise, { status: 201 });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
