import "server-only";

import { auth } from "@/auth";
import { createJsonErrorResponse } from "@/lib/api-response";

export async function getAuthenticatedUserId() {
  const session = await auth();

  return session?.user?.id ?? null;
}

export function createUserUnauthorizedResponse() {
  return createJsonErrorResponse("Unauthorized", 401);
}
