import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuthActionToken } from "@/lib/auth/action-tokens";
import { scheduleAuthEmailDelivery } from "@/lib/auth/email";
import { createPasswordAccount } from "@/lib/auth/password-registration";
import { waitForMinimumAuthResponse } from "@/lib/auth/enumeration-resistance";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth/rate-limit";
import {
  assertTrustedAuthOrigin,
  hashPassword,
  normalizeAuthEmail,
} from "@/lib/auth/security";
import { registrationSchema } from "@/lib/auth/validation";

export const runtime = "nodejs";
const GENERIC_MESSAGE =
  "If this address can be registered, a verification email is on its way.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid authentication request." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the email and password requirements.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const emailNormalized = normalizeAuthEmail(parsed.data.email);
  const limit = await consumeAuthRateLimit({
    request,
    subject: emailNormalized,
    rule: AUTH_RATE_LIMITS.register,
  });
  const ipLimit = await consumeAuthRateLimit({ request, subject: "*", rule: AUTH_RATE_LIMITS.registerIp });
  if (!limit.allowed || !ipLimit.allowed) {
    return NextResponse.json(
      { error: GENERIC_MESSAGE },
      { status: 202, headers: { "Retry-After": String(Math.max(limit.retryAfterSeconds, ipLimit.retryAfterSeconds)) } }
    );
  }

  // Argon2 work is intentionally performed for both existing and new
  // identities so registration timing does not reveal account existence.
  const passwordHash = await hashPassword(parsed.data.password);
  const existing = await prisma.user.findFirst({
    where: { email: { equals: emailNormalized, mode: "insensitive" } },
    include: { passwordCredential: true },
  });

  if (existing) {
    if (!existing.deletedAt && existing.passwordCredential && !existing.emailVerified) {
      const { deliveryId } = await createAuthActionToken({
        userId: existing.id,
        emailNormalized,
        purpose: "EMAIL_VERIFICATION",
      });
      scheduleAuthEmailDelivery(deliveryId);
    }
    await waitForMinimumAuthResponse(startedAt);
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 202 });
  }

  try {
    const user = await createPasswordAccount({ emailNormalized, passwordHash });
    const { deliveryId } = await createAuthActionToken({
      userId: user.id,
      emailNormalized,
      purpose: "EMAIL_VERIFICATION",
    });
    scheduleAuthEmailDelivery(deliveryId);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  await waitForMinimumAuthResponse(startedAt);
  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 202 });
}
