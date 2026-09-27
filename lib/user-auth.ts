import "server-only";

import { auth } from "@/auth";
import { createJsonErrorResponse } from "@/lib/api-response";
import { parseNativeBearerHeader, resolveNativeSession } from "@/lib/auth/native-session";

export type AuthenticatedPrincipal =
  | { userId: string; authority: "native"; nativeSessionId: string }
  | { userId: string; authority: "web"; nativeSessionId: null };

export async function getAuthenticatedPrincipal(request?: Request): Promise<AuthenticatedPrincipal | null> {
  if (request) {
    const bearer = parseNativeBearerHeader(request.headers.get("authorization"));
    if (bearer.supplied) {
      if (!bearer.token) return null;
      const nativeSession = await resolveNativeSession(bearer.token);
      return nativeSession
        ? { userId: nativeSession.userId, authority: "native", nativeSessionId: nativeSession.id }
        : null;
    }
  }
  const session = await auth();
  return session?.user?.id
    ? { userId: session.user.id, authority: "web", nativeSessionId: null }
    : null;
}

export async function getAuthenticatedUserId(request?: Request) {
  return (await getAuthenticatedPrincipal(request))?.userId ?? null;
}

export function createUserUnauthorizedResponse() {
  return createJsonErrorResponse("Unauthorized", 401);
}
