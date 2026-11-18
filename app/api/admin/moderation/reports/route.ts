import { createInternalServerErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminModerationReports } from "@/lib/moderation-admin";

export async function GET() {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  try {
    return Response.json({ reports: await getAdminModerationReports() });
  } catch (error) {
    console.error("ADMIN_MODERATION_REPORTS_FAILED", error);
    return createInternalServerErrorResponse("ADMIN_MODERATION_REPORTS_FAILED");
  }
}
