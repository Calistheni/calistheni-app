import { prisma } from "@/lib/prisma";
import { getUserEntitlements } from "@/lib/entitlements";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import {
  nativeCorsJson,
  nativeCorsPreflight,
  rejectDisallowedNativeOrigin,
} from "@/lib/native-api-cors";

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

  const [
    user,
    workouts,
    completedSets,
    submittedParks,
    approvedEdits,
    approvedPhotos,
    entitlement,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        bodyweightKg: true,
        measurementSystem: true,
        rewardPoints: true,
        _count: { select: { followers: true, following: true } },
      },
    }),
    prisma.workout.count({ where: { userId } }),
    prisma.workoutSet.count({
      where: { completed: true, workoutExercise: { workout: { userId } } },
    }),
    prisma.park.count({ where: { submittedById: userId } }),
    prisma.parkEditSubmission.count({ where: { submittedById: userId, status: "APPROVED" } }),
    prisma.parkPhoto.count({
      where: { uploadedById: userId, park: { submissionStatus: "APPROVED", deletedAt: null } },
    }),
    getUserEntitlements(userId),
  ]);

  if (!user) {
    return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  return nativeCorsJson(request, {
    user: { id: user.id, name: user.name, username: user.username, image: user.image },
    stats: {
      workouts,
      completedSets,
      submittedParks,
      approvedEdits,
      approvedPhotos,
      rewardPoints: user.rewardPoints,
      followers: user._count.followers,
      following: user._count.following,
    },
    body: {
      bodyweightKg: user.bodyweightKg,
      measurementSystem: user.measurementSystem,
    },
    entitlement: { isPro: entitlement.entitlements.isPro },
    updatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
