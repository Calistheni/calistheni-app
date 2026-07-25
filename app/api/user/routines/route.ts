import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { createUserRoutine, mapRoutineDetail, routineInclude } from "@/lib/routines";
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

function logRoutineSaveError(
  error: unknown,
  context: {
    operation: "create";
    userId: string;
    exerciseCount: number;
    supersetCount: number;
  }
) {
  console.error("Routine persistence failed", {
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

export async function GET() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  try {
    const routines = await prisma.workoutTemplate.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: routineInclude,
    });

    return NextResponse.json(routines.map(mapRoutineDetail));
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
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
      operation: "create",
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
    const result = await createUserRoutine(userId, parsedBody.data);

    if ("routine" in result) {
      return NextResponse.json(result.routine, { status: 201 });
    }

    if ("code" in result && result.code === "ROUTINE_LIMIT_REACHED") {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: 403 }
      );
    }

    if ("code" in result) {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: 400 }
      );
    }

    return createJsonErrorResponse(result.error, 400);
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

    logRoutineSaveError(error, {
      operation: "create",
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
