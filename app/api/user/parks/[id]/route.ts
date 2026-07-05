import { createJsonErrorResponse } from "@/lib/api-response";
import { POST as createParkEditSubmission } from "@/app/api/user/parks/[id]/edits/route";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return createParkEditSubmission(request, context);
}

export async function DELETE() {
  return createJsonErrorResponse("Only admins can delete parks.", 403);
}
