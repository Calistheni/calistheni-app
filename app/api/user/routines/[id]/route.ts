import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { mapRoutineDetail, routineInclude, updateUserRoutine } from "@/lib/routines";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import {
  getRoutineValidationError,
  routineMutationSchema,
} from "@/lib/validation/routines";
import { Prisma } from "@/lib/generated/prisma/client";
import { UnresolvedRoutineExerciseError } from "@/lib/routine-superset-mapping";

function logRoutineUpdateError(
  error: unknown,
  context: {
    routineId: number;
    userId: string;
    exerciseCount: number;
    supersetCount: number;
  }
) {
  console.error("Routine persistence failed", {
    operation: "update",
    ...context,
    prismaCode:
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : undefined,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage:
      error instanceof Error ? error.message : "Unknown routine error",
  });
}

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
    const validationError = getRoutineValidationError(parsedBody.error);
    console.warn("Routine validation failed", {
      operation: "update",
      routineId,
      userId,
      ...validationError,
    });
    return NextResponse.json(
      {
        error: validationError.message,
        ...validationError,
        fieldErrors: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  try {
    const result = await updateUserRoutine(userId, routineId, parsedBody.data);

    if ("routine" in result) {
      return NextResponse.json(result.routine);
    }

    if ("code" in result) {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: 400 }
      );
    }

    return createJsonErrorResponse(result.error, 404);
  } catch (error) {
    if (error instanceof UnresolvedRoutineExerciseError) {
      return NextResponse.json(
        {
          code: error.code,
          path: ["supersets"],
          error: error.message,
        },
        { status: 400 }
      );
    }

    logRoutineUpdateError(error, {
      routineId,
      userId,
      exerciseCount: parsedBody.data.exercises.length,
      supersetCount: parsedBody.data.supersets.length,
    });
    return createJsonErrorResponse(
      "Could not save this routine because its exercise or superset configuration is invalid.",
      500
    );
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
