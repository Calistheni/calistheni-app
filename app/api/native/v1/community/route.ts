import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import {
  nativeCorsJson,
  nativeCorsPreflight,
  rejectDisallowedNativeOrigin,
} from "@/lib/native-api-cors";
import { mapWorkoutSummary } from "@/lib/workouts";
import { completePrimaryPresentation } from "@/lib/primary-presentation";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return nativeCorsPreflight(request);
}

export async function GET(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  const following = await prisma.userFollow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = following.map((item) => item.followingId);
  const workouts = followingIds.length
    ? await prisma.workout.findMany({
        where: {
          userId: { in: followingIds },
          visibility: "PUBLIC",
          completedAt: { not: null },
          exercises: { none: { exercise: { createdByUserId: { not: null } } } },
        },
        orderBy: { completedAt: "desc" },
        take: 12,
        select: {
          id: true,
          title: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
          visibility: true,
          user: { select: { id: true, name: true, image: true, bodyweightKg: true } },
          exercises: {
            select: {
              exercise: { select: { trackingType: true, bodyweightLoadFactor: true } },
              sets: { select: { reps: true, weight: true, completed: true } },
            },
          },
        },
      })
    : [];
  return nativeCorsJson(
    request,
    completePrimaryPresentation({
      items: workouts.map((workout) => {
        const summary = mapWorkoutSummary(workout);
        return {
          id: summary.id,
          title: summary.title || "Workout",
          completedAt: summary.completedAt,
          exerciseCount: summary.exerciseCount,
          setCount: summary.setCount,
          totalVolume: summary.totalVolume,
          athlete: { id: workout.user.id, name: workout.user.name, image: workout.user.image },
        };
      }),
      updatedAt: new Date().toISOString(),
    }),
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
