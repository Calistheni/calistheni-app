import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { mapRoutineDetail, routineInclude, updateUserRoutine } from "@/lib/routines";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { routineMutationSchema } from "@/lib/validation/routines";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const routineId = parsePositiveInteger(id);

  if (routineId === null) {
    return createJsonErrorResponse("Invalid routine id.", 400);
  }

  try {
    const routine = await prisma.workoutTemplate.findFirst({
      where: {
        id: routineId,
        userId,
      },
      include: routineInclude,
    });

    if (!routine) {
      return createJsonErrorResponse("Routine not found.", 404);
    }

    return NextResponse.json(mapRoutineDetail(routine));
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const routineId = parsePositiveInteger(id);

  if (routineId === null) {
    return createJsonErrorResponse("Invalid routine id.", 400);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsedBody = routineMutationSchema.safeParse(body);

  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid routine payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  try {
    const result = await updateUserRoutine(userId, routineId, parsedBody.data);

    if ("routine" in result) {
      return NextResponse.json(result.routine);
    }

    return createJsonErrorResponse(result.error, 404);
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

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const routineId = parsePositiveInteger(id);

  if (routineId === null) {
    return createJsonErrorResponse("Invalid routine id.", 400);
  }

  try {
    const result = await prisma.workoutTemplate.deleteMany({
      where: {
        id: routineId,
        userId,
      },
    });

    if (result.count !== 1) {
      return createJsonErrorResponse("Routine not found.", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
