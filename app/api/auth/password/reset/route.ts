import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth/rate-limit";
import {
  assertTrustedAuthOrigin,
  hashAuthSecret,
  hashPassword,
  validatePassword,
} from "@/lib/auth/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { token?: unknown; password?: unknown; confirmPassword?: unknown }
    | null;
  if (
    typeof body?.token !== "string" ||
    typeof body.password !== "string" ||
    body.password !== body.confirmPassword ||
    validatePassword(body.password)
  ) {
    return NextResponse.json({ error: "Check the password requirements." }, { status: 400 });
  }
  const limit = await consumeAuthRateLimit({ request, subject: hashAuthSecret(body.token), rule: AUTH_RATE_LIMITS.passwordReset });
  const ipLimit = await consumeAuthRateLimit({ request, subject: "*", rule: AUTH_RATE_LIMITS.passwordResetIp });
  if (!limit.allowed || !ipLimit.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const passwordHash = await hashPassword(body.password);
  const now = new Date();
  const reset = await prisma.$transaction(async (tx) => {
    const token = await tx.authActionToken.findFirst({
      where: {
        tokenHash: hashAuthSecret(body.token as string),
        purpose: "PASSWORD_RESET",
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!token) return false;
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${token.userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) return false;
    const consumed = await tx.authActionToken.updateMany({
      where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return false;
    await tx.passwordCredential.update({
      where: { userId: token.userId },
      data: { passwordHash, passwordChangedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: token.userId } });
    await tx.nativeSession.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
  return reset
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "This password reset link is invalid or expired." }, { status: 400 });
}
