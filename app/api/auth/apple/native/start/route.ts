import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDatabaseSessionFromRequest, isRecentAuthentication } from "@/lib/auth/database-session";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth/rate-limit";
import { assertTrustedAuthOrigin, createAuthSecret, hashAuthSecret } from "@/lib/auth/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid Apple authentication request." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { intent?: unknown } | null;
  const intent = body?.intent === "link" ? "link" : body?.intent === "login" ? "login" : null;
  if (!intent) return NextResponse.json({ error: "Invalid Apple authentication intent." }, { status: 400 });
  const limit = await consumeAuthRateLimit({ request, subject: intent, rule: AUTH_RATE_LIMITS.apple });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const session = intent === "link" ? await getDatabaseSessionFromRequest(request) : null;
  if (intent === "link" && (!session || !isRecentAuthentication(session.authenticatedAt))) {
    return NextResponse.json({ error: "RECENT_AUTH_REQUIRED" }, { status: 403 });
  }
  const state = createAuthSecret();
  const nonce = createAuthSecret();
  await prisma.appleAuthAttempt.create({
    data: {
      userId: session?.userId,
      intent,
      stateHash: hashAuthSecret(state),
      nonceHash: hashAuthSecret(nonce),
      sessionTokenHash: session?.sessionTokenHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return NextResponse.json({ state, nonce });
}
