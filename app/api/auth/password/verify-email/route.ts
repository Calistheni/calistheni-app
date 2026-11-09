import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertTrustedAuthOrigin, hashAuthSecret } from "@/lib/auth/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid verification request." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== "string") {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }
  const now = new Date();
  const verified = await prisma.$transaction(async (tx) => {
    const token = await tx.authActionToken.findFirst({
      where: {
        tokenHash: hashAuthSecret(body.token as string),
        purpose: "EMAIL_VERIFICATION",
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
    const credential = await tx.passwordCredential.findUnique({
      where: { userId: token.userId },
    });
    if (!credential || credential.emailNormalized !== token.emailNormalized) return false;
    await tx.user.update({ where: { id: token.userId }, data: { emailVerified: now } });
    return true;
  });
  return verified
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
}
