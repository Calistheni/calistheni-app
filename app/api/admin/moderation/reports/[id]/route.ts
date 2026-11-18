import { z } from "zod";
import { ModerationActionType } from "@/lib/generated/prisma/client";
import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, getAdminActorLabel, isAdminAuthenticated } from "@/lib/admin-auth";
import { applyModerationAction } from "@/lib/moderation-admin";

const schema = z.object({
  action: z.enum(ModerationActionType),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return createJsonErrorResponse("Invalid moderation action.", 400);
  try {
    const result = await applyModerationAction({ reportId: (await params).id, actorLabel: await getAdminActorLabel(), ...parsed.data });
    if (result.state === "NOT_FOUND") return createJsonErrorResponse("Report not found.", 404);
    if (result.state === "TARGET_NOT_FOUND") return createJsonErrorResponse("Reported content is no longer available.", 409);
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    console.error("ADMIN_MODERATION_ACTION_FAILED", error);
    return createInternalServerErrorResponse("ADMIN_MODERATION_ACTION_FAILED");
  }
}
