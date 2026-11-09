import { NextResponse } from "next/server";
import { AUTH_LINK_COOKIE, createOAuthLinkIntent, isLinkableProvider } from "@/lib/auth/account-linking";
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid linking request." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { provider?: unknown } | null;
  if (!isLinkableProvider(body?.provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }
  const result = await createOAuthLinkIntent(request, body.provider);
  if ("error" in result) {
    const status = result.error === "UNAUTHORIZED" ? 401 : result.error === "RECENT_AUTH_REQUIRED" ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  const response = NextResponse.json({ ok: true, provider: body.provider });
  response.cookies.set(AUTH_LINK_COOKIE, result.secret, {
    httpOnly: true,
    secure: new URL(getSiteUrl()).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
