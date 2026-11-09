import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { authHmac, getClientAddress } from "@/lib/auth/security";

type RateLimitRule = {
  action: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

async function withSerializableRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2002", "P2034"].includes(error.code) ||
        attempt === 2
      ) {
        throw error;
      }
    }
  }
  throw new Error("Authentication rate-limit retry exhausted.");
}

export async function consumeAuthRateLimit({
  request,
  subject,
  rule,
  now = new Date(),
}: {
  request: Request;
  subject: string;
  rule: RateLimitRule;
  now?: Date;
}) {
  const keyHash = authHmac(
    `${rule.action}\0${getClientAddress(request)}\0${subject}`
  );

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const current = await tx.authRateLimit.findUnique({ where: { keyHash } });
        if (current?.blockedUntil && current.blockedUntil > now) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((current.blockedUntil.getTime() - now.getTime()) / 1000)
            ),
          };
        }

        const windowExpired =
          !current || current.windowStartedAt.getTime() + rule.windowMs <= now.getTime();
        const count = windowExpired ? 1 : current.count + 1;
        const blockedUntil =
          count > rule.limit ? new Date(now.getTime() + rule.blockMs) : null;
        const expiresAt = new Date(
          Math.max(
            now.getTime() + rule.windowMs + rule.blockMs,
            blockedUntil?.getTime() ?? 0
          )
        );

        await tx.authRateLimit.upsert({
          where: { keyHash },
          create: {
            keyHash,
            action: rule.action,
            count,
            windowStartedAt: now,
            blockedUntil,
            expiresAt,
          },
          update: {
            action: rule.action,
            count,
            windowStartedAt: windowExpired ? now : current!.windowStartedAt,
            blockedUntil,
            expiresAt,
          },
        });

        return {
          allowed: blockedUntil === null,
          retryAfterSeconds: blockedUntil
            ? Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)
            : 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

export const AUTH_RATE_LIMITS = {
  register: { action: "register", limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  registerIp: { action: "register-ip", limit: 20, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  login: { action: "login", limit: 8, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  loginIp: { action: "login-ip", limit: 40, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  forgot: { action: "forgot", limit: 4, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  forgotIp: { action: "forgot-ip", limit: 20, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  passwordReset: { action: "password-reset", limit: 8, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  passwordResetIp: { action: "password-reset-ip", limit: 20, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  passwordManage: { action: "password-manage", limit: 8, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  resend: { action: "resend", limit: 3, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  apple: { action: "apple", limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
} satisfies Record<string, RateLimitRule>;
