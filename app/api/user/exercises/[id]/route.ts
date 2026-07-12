import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { customExerciseMutationSchema } from "@/lib/validation/exercises";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  try {
    const exercise = await prisma.exercise.findFirst({
      where: { id, createdByUserId: userId },
      select: { id: true },
    });
    if (!exercise) return createJsonErrorResponse("Exercise not found.", 404);

    const updated = await prisma.exercise.update({
      where: { id },
      data: parsed.data,
    });
    return Response.json(updated);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { id } = await params;

  try {
    const exercise = await prisma.exercise.findFirst({
      where: { id, createdByUserId: userId },
      select: {
        id: true,
        _count: {
          select: {
            workoutExercises: true,
            templateExercises: true,
            personalRecords: true,
          },
        },
      },
    });
    if (!exercise) return createJsonErrorResponse("Exercise not found.", 404);

    const referenceCount =
      exercise._count.workoutExercises +
      exercise._count.templateExercises +
      exercise._count.personalRecords;
    if (referenceCount > 0) {
      return createJsonErrorResponse(
        "This exercise is used in workout history or a routine and cannot be deleted. You can still edit it.",
        409
      );
    }

    await prisma.exercise.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
