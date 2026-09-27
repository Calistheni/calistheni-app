import { prisma } from "@/lib/prisma";
import { publicParkWhere } from "@/lib/parks";
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
  if (!userId) return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  const [count, latest] = await Promise.all([
    prisma.park.count({ where: publicParkWhere }),
    prisma.park.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  return nativeCorsJson(
    request,
    { publicParkCount: count, version: latest?.updatedAt.toISOString() ?? null, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
