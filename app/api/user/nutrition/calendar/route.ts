import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  monthCalendarRange,
  getNutritionCalendarProgress,
} from "@/lib/nutrition/goal-service";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const monthSchema = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const month = new URL(request.url).searchParams.get("month");
  if (!month || !monthSchema.test(month)) {
    return createJsonValidationErrorResponse("Invalid nutrition month.", {
      month: ["Use YYYY-MM."],
    });
  }
  try {
    const { startDateKey, endDateKey } = monthCalendarRange(month);
    const progress = await getNutritionCalendarProgress(
      userId,
      startDateKey,
      endDateKey
    );
    return NextResponse.json(progress, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("NUTRITION_CALENDAR_GET_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
