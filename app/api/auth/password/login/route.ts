import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createDatabaseSession,
  readAuthSessionToken,
  setDatabaseSessionCookie,
} from "@/lib/auth/database-session";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth/rate-limit";
import {
  assertTrustedAuthOrigin,
  DUMMY_PASSWORD_HASH,
  normalizeAuthEmail,
  verifyPassword,
} from "@/lib/auth/security";
import { loginSchema } from "@/lib/auth/validation";

export const runtime = "nodejs";

function safeRedirect(value: string | undefined, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : fallback;
}

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid authentication request." }, { status: 403 });
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const emailNormalized = normalizeAuthEmail(parsed.data.email);
  const limit = await consumeAuthRateLimit({
    request,
    subject: emailNormalized,
    rule: AUTH_RATE_LIMITS.login,
  });
  const ipLimit = await consumeAuthRateLimit({ request, subject: "*", rule: AUTH_RATE_LIMITS.loginIp });
  if (!limit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(limit.retryAfterSeconds, ipLimit.retryAfterSeconds)) } }
    );
  }

  const credential = await prisma.passwordCredential.findUnique({
    where: { emailNormalized },
    include: { user: true },
  });
  const passwordValid = await verifyPassword(
    credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
    parsed.data.password
  );
  if (!credential || !passwordValid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (credential.user.deletedAt) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (!credential.user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email before signing in.", code: "EMAIL_VERIFICATION_REQUIRED" },
      { status: 403 }
    );
  }

  const oldSessionToken = readAuthSessionToken(request);
  let sessionToken: string;
  try {
    sessionToken = await createDatabaseSession(credential.userId, new Date(), "password");
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_USER_DEACTIVATED") {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    throw error;
  }
  if (oldSessionToken) {
    await prisma.session.deleteMany({ where: { sessionToken: oldSessionToken } });
  }
  const redirectTo = safeRedirect(
    parsed.data.redirectTo,
    credential.user.onboardingCompleted ? "/home" : "/onboarding"
  );
  const response = NextResponse.json({ ok: true, redirectTo });
  setDatabaseSessionCookie(response, sessionToken);
  return response;
}
