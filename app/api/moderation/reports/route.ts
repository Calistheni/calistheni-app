import { z } from "zod";
import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { createModerationReport } from "@/lib/moderation";
import {
  MODERATION_REPORT_REASON_VALUES,
  MODERATION_REPORT_TARGETS,
} from "@/lib/moderation-shared";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const reportSchema = z.object({
  targetType: z.enum(MODERATION_REPORT_TARGETS),
  targetId: z.string().trim().min(1).max(128),
  reason: z.enum(MODERATION_REPORT_REASON_VALUES),
  explanation: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const reporterId = await getAuthenticatedUserId();
  if (!reporterId) return createUserUnauthorizedResponse();

  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return createJsonErrorResponse("Invalid report.", 400);

  try {
    const result = await createModerationReport({ reporterId, ...parsed.data });
    if (result.state === "TARGET_NOT_FOUND") return createJsonErrorResponse("Content is unavailable or cannot be reported.", 404);
    if (result.state === "DUPLICATE") return createJsonErrorResponse("You already reported this content.", 409);
    if (result.state === "RATE_LIMITED") return createJsonErrorResponse("Too many reports. Please try again later.", 429);
    return Response.json({ ok: true, reportId: result.reportId }, { status: 201 });
  } catch (error) {
    console.error("MODERATION_REPORT_CREATE_FAILED", { reporterId, error });
    return createInternalServerErrorResponse("MODERATION_REPORT_CREATE_FAILED");
  }
}
