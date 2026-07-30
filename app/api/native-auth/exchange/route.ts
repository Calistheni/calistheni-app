import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeNativeRedirectPath } from "@/lib/auth/native-auth";
import {
  createNativeAuthSecret,
  getAuthSessionCookieName,
  getNativeAuthCookieOptions,
  hashNativeAuthSecret,
  logNativeAuth,
  NATIVE_AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/native-auth-server";

export const runtime = "nodejs";

function isValidSecret(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

export async function POST(request: Request) {
  let body: { attempt?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid authentication handoff.", code: "NATIVE_AUTH_EXCHANGE_INVALID" }, { status: 400 });
  }
  if (!isValidSecret(body.code) || typeof body.attempt !== "string" || !body.attempt) {
    return NextResponse.json({ error: "Invalid authentication handoff.", code: "NATIVE_AUTH_EXCHANGE_INVALID" }, { status: 400 });
  }
  const attemptId = body.attempt;
  const handoffCode = body.code;

  const now = new Date();
  const sessionToken = createNativeAuthSecret();
  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.nativeAuthAttempt.findFirst({
      where: {
        id: attemptId,
        handoffCodeHash: hashNativeAuthSecret(handoffCode),
        consumedAt: null,
        expiresAt: { gt: now },
        userId: { not: null },
      },
      select: { id: true, userId: true, redirectPath: true },
    });
    if (!attempt?.userId) return null;

    const consumed = await tx.nativeAuthAttempt.updateMany({
      where: { id: attempt.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;

    await tx.session.create({
      data: {
        sessionToken,
        userId: attempt.userId,
        expires: new Date(now.getTime() + NATIVE_AUTH_SESSION_MAX_AGE_SECONDS * 1000),
      },
    });
    return attempt;
  });

  if (!result) {
    logNativeAuth("exchange_rejected", { attemptId });
    return NextResponse.json({ error: "This sign-in link is invalid or has expired.", code: "NATIVE_AUTH_EXCHANGE_REJECTED" }, { status: 401 });
  }

  const response = NextResponse.json({ redirectTo: sanitizeNativeRedirectPath(result.redirectPath) });
  response.cookies.set(
    getAuthSessionCookieName(),
    sessionToken,
    getNativeAuthCookieOptions(NATIVE_AUTH_SESSION_MAX_AGE_SECONDS)
  );
  logNativeAuth("exchange_succeeded", { attemptId: result.id, userId: result.userId });
  return response;
}
