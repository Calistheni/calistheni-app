import { NextResponse } from "next/server";
import {
  MAX_WEEKLY_CARDIO_GOAL_MINUTES,
  MIN_WEEKLY_CARDIO_GOAL_MINUTES,
  parseWeeklyCardioGoalMinutes,
} from "@/lib/cardio";
import { prisma } from "@/lib/prisma";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

type CardioGoalPayload = {
  goalMinutes?: unknown;
};

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  let body: CardioGoalPayload;
  try {
    body = (await request.json()) as CardioGoalPayload;
  } catch {
    return NextResponse.json(
      {
        code: "CARDIO_GOAL_INVALID",
        error: "Invalid JSON payload.",
      },
      { status: 400 }
    );
  }

  const goalMinutes = parseWeeklyCardioGoalMinutes(body.goalMinutes);
  if (goalMinutes === null) {
    return NextResponse.json(
      {
        code: "CARDIO_GOAL_INVALID",
        error: `Weekly cardio goal must be a whole number between ${MIN_WEEKLY_CARDIO_GOAL_MINUTES} and ${MAX_WEEKLY_CARDIO_GOAL_MINUTES} minutes.`,
      },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { weeklyCardioGoalMinutes: goalMinutes },
      select: { weeklyCardioGoalMinutes: true },
    });

    return NextResponse.json({
      goalMinutes: user.weeklyCardioGoalMinutes,
    });
  } catch (error) {
    const prismaCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    console.error("CARDIO_GOAL_UPDATE_FAILED", {
      userId,
      route: "/api/user/cardio-goal",
      prismaCode,
    });
    return NextResponse.json(
      {
        code: "CARDIO_GOAL_UPDATE_FAILED",
        error: "Unable to save your cardio goal.",
      },
      { status: 500 }
    );
  }
}
