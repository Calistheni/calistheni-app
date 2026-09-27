import { getAuthenticatedPrincipal } from "@/lib/user-auth";
import { revokeNativeSession } from "@/lib/auth/native-session";
import { nativeCorsJson, nativeCorsPreflight, rejectDisallowedNativeOrigin } from "@/lib/native-api-cors";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

export async function POST(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const principal = await getAuthenticatedPrincipal(request);
  if (!principal || principal.authority !== "native") {
    return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  await revokeNativeSession(principal.nativeSessionId);
  return nativeCorsJson(request, { revoked: true }, { headers: { "Cache-Control": "no-store" } });
}
