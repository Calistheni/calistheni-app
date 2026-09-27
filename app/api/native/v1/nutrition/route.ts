import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import {
  nativeCorsJson,
  nativeCorsPreflight,
  rejectDisallowedNativeOrigin,
} from "@/lib/native-api-cors";
import { serializeNutritionEntry } from "@/lib/nutrition/entry-serializer";
import {
  nutritionDate,
  nutritionDateSchema,
  nutritionTotals,
} from "@/lib/nutrition/log";
import { getNutritionGoalForDate } from "@/lib/nutrition/goal-service";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return nativeCorsPreflight(request);
}

export async function GET(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const date = nutritionDateSchema.safeParse(new URL(request.url).searchParams.get("date"));
  if (!date.success) {
    return nativeCorsJson(request, { error: "Invalid nutrition date.", code: "INVALID_DATE" }, { status: 400 });
  }
  const [entries, goal] = await Promise.all([
    prisma.nutritionEntrySnapshot.findMany({
      where: { userId, loggedFor: nutritionDate(date.data) },
      include: {
        food: {
          include: {
            aliases: { select: { name: true } },
            details: { select: { categories: true, productImageUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    getNutritionGoalForDate(userId, date.data),
  ]);
  const serialized = entries.map(serializeNutritionEntry);
  return nativeCorsJson(
    request,
    { date: date.data, totals: nutritionTotals(serialized), goal, entryCount: serialized.length, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
