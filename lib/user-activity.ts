import "server-only";

import { UserActivityEventType } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function recordBarcodeLookup({ userId, succeeded, foodId }: { userId: string; succeeded: boolean; foodId?: string | null }) {
  // Never store the decoded barcode. This event only answers a support question:
  // whether the authenticated lookup reached the server and resolved a food.
  await prisma.userActivityEvent.create({
    data: {
      userId,
      type: UserActivityEventType.BARCODE_LOOKUP,
      entityType: foodId ? "FOOD" : null,
      entityId: foodId ?? null,
      metadata: { succeeded },
    },
  });
}
