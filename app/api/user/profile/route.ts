import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";

type ProfileUpdatePayload = {
  bodyweightKg?: unknown;
};

function parseBodyweightKg(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 20 || parsedValue > 300) {
    return undefined;
  }

  return parsedValue;
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let body: ProfileUpdatePayload;

  try {
    body = (await request.json()) as ProfileUpdatePayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const bodyweightKg = parseBodyweightKg(body.bodyweightKg);

  if (bodyweightKg === undefined) {
    return createJsonErrorResponse(
      "Bodyweight must be between 20 and 300 kg.",
      400
    );
  }

  try {
    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        bodyweightKg,
      },
      select: {
        bodyweightKg: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
