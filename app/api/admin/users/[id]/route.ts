import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminUserInsight } from "@/lib/admin-user-insights";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  try {
    const insight = await getAdminUserInsight((await params).id);
    return insight ? NextResponse.json(insight) : createJsonErrorResponse("User not found.", 404);
  } catch (error) {
    console.error("ADMIN_USER_INSIGHT_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
