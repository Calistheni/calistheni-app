import { createNativeSession } from "@/lib/auth/native-session";
import { getAuthenticatedPrincipal } from "@/lib/user-auth";
import { nativeCorsJson, nativeCorsPreflight } from "@/lib/native-api-cors";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return nativeCorsPreflight(request); }

/** Opt-in staged migration capability for a remote native runtime with an Auth.js cookie. */
export async function POST(request: Request) {
  const principal = await getAuthenticatedPrincipal(request);
  if (!principal || principal.authority !== "web") {
    return nativeCorsJson(request, { error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const created = await createNativeSession(principal.userId, "IOS");
  return nativeCorsJson(request, {
    token: created.token,
    tokenType: "Bearer",
    expiresAt: created.session.expiresAt.toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
