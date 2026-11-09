import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthActionToken } from "@/lib/auth/action-tokens";
import { scheduleAuthEmailDelivery } from "@/lib/auth/email";
import { waitForMinimumAuthResponse } from "@/lib/auth/enumeration-resistance";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth/rate-limit";
import { assertTrustedAuthOrigin, normalizeAuthEmail } from "@/lib/auth/security";
import { emailSchema } from "@/lib/auth/validation";

export const runtime = "nodejs";
const MESSAGE = "If an account exists, a password reset email is on its way.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const parsed = emailSchema.safeParse(body?.email);
  if (!parsed.success) return NextResponse.json({ message: MESSAGE }, { status: 202 });
  const emailNormalized = normalizeAuthEmail(parsed.data);
  const limit = await consumeAuthRateLimit({ request, subject: emailNormalized, rule: AUTH_RATE_LIMITS.forgot });
  const ipLimit = await consumeAuthRateLimit({ request, subject: "*", rule: AUTH_RATE_LIMITS.forgotIp });
  if (!limit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ message: MESSAGE }, { status: 202, headers: { "Retry-After": String(Math.max(limit.retryAfterSeconds, ipLimit.retryAfterSeconds)) } });
  }
  const credential = await prisma.passwordCredential.findUnique({
    where: { emailNormalized },
    include: { user: { select: { deletedAt: true } } },
  });
  if (credential && !credential.user.deletedAt) {
    const { deliveryId } = await createAuthActionToken({
      userId: credential.userId,
      emailNormalized,
      purpose: "PASSWORD_RESET",
    });
    scheduleAuthEmailDelivery(deliveryId);
  }
  await waitForMinimumAuthResponse(startedAt);
  return NextResponse.json({ message: MESSAGE }, { status: 202 });
}
