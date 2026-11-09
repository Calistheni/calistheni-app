import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { reviewDeletionCommunityTask } from "@/lib/account-deletion-review";

export const runtime = "nodejs";

type ReviewTaskContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: ReviewTaskContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const action = body?.action;
  if (typeof id !== "string" || !id || (action !== "KEEP_ANONYMIZED" && action !== "REMOVE_FROM_PUBLIC")) {
    return NextResponse.json({ error: "Invalid review task or action." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const status = await reviewDeletionCommunityTask(id, action);
    return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "REVIEW_TASK_NOT_OPEN" || message === "DELETION_ALREADY_COMPLETED"
      ? 409
      : message === "FOOD_REVIEW_SCAN_INCOMPLETE"
        ? 409
        : message === "REVIEW_RESOURCE_MISSING"
          ? 404
          : message === "REVIEW_KIND_UNSUPPORTED"
            ? 400
            : 500;
    return NextResponse.json({ error: "Unable to resolve review task." }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
