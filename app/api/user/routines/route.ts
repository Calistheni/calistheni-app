import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { createUserRoutine, mapRoutineDetail, routineInclude } from "@/lib/routines";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { routineMutationSchema } from "@/lib/validation/routines";

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
    return createJsonValidationErrorResponse(
      "Invalid routine payload.",
      parsedBody.error.flatten().fieldErrors
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

    return createJsonErrorResponse(result.error, 400);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
