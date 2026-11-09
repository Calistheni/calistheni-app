import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthActionToken } from "@/lib/auth/action-tokens";
import { getDatabaseSessionFromRequest, isRecentAuthentication, markSessionRecentlyAuthenticated, readAuthSessionToken } from "@/lib/auth/database-session";
import { scheduleAuthEmailDelivery } from "@/lib/auth/email";
import { assertTrustedAuthOrigin, hashPassword, normalizeAuthEmail, validatePassword, verifyPassword } from "@/lib/auth/security";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

type Body = { action?: unknown; currentPassword?: unknown; password?: unknown; confirmPassword?: unknown };

export async function POST(request: Request) {
  try { assertTrustedAuthOrigin(request); } catch {
    return NextResponse.json({ error: "Invalid authentication request." }, { status: 403 });
  }
  const session = await getDatabaseSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const limit = await consumeAuthRateLimit({ request, subject: session.userId, rule: AUTH_RATE_LIMITS.passwordManage });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const credential = await prisma.passwordCredential.findUnique({ where: { userId: session.userId } });

  if (body?.action === "reauthenticate") {
    if (!credential || typeof body.currentPassword !== "string" || !(await verifyPassword(credential.passwordHash, body.currentPassword))) {
      return NextResponse.json({ error: "The current password is incorrect." }, { status: 401 });
    }
    await markSessionRecentlyAuthenticated(request);
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "add" && !isRecentAuthentication(session.authenticatedAt)) {
    return NextResponse.json({ error: "RECENT_AUTH_REQUIRED" }, { status: 403 });
  }
  if (typeof body?.password !== "string" || body.password !== body.confirmPassword || validatePassword(body.password)) {
    return NextResponse.json({ error: "Check the password requirements." }, { status: 400 });
  }
  const passwordHash = await hashPassword(body.password);

  if (body.action === "add") {
    if (credential) return NextResponse.json({ error: "A password is already configured." }, { status: 409 });
    if (!session.user.email) return NextResponse.json({ error: "Add an email address before configuring a password." }, { status: 400 });
    const emailNormalized = normalizeAuthEmail(session.user.email);
    const collision = await prisma.user.findFirst({
      where: { id: { not: session.userId }, email: { equals: emailNormalized, mode: "insensitive" } },
      select: { id: true },
    });
    if (collision) return NextResponse.json({ error: "This email identity cannot be configured safely." }, { status: 409 });
    await prisma.passwordCredential.create({ data: { userId: session.userId, emailNormalized, passwordHash } });
    if (!session.user.emailVerified) {
      const { deliveryId } = await createAuthActionToken({ userId: session.userId, emailNormalized, purpose: "EMAIL_VERIFICATION" });
      scheduleAuthEmailDelivery(deliveryId);
    }
    return NextResponse.json({ ok: true, verificationRequired: !session.user.emailVerified });
  }

  if (body.action === "change") {
    if (!credential || typeof body.currentPassword !== "string" || !(await verifyPassword(credential.passwordHash, body.currentPassword))) {
      return NextResponse.json({ error: "The current password is incorrect." }, { status: 401 });
    }
    const currentSessionToken = readAuthSessionToken(request);
    const now = new Date();
    await prisma.$transaction([
      prisma.passwordCredential.update({ where: { userId: session.userId }, data: { passwordHash, passwordChangedAt: now } }),
      prisma.session.deleteMany({ where: { userId: session.userId, ...(currentSessionToken ? { sessionToken: { not: currentSessionToken } } : {}) } }),
      prisma.nativeSession.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await markSessionRecentlyAuthenticated(request);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported password action." }, { status: 400 });
}
