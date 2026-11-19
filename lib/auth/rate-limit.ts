import "server-only";

import { isIP } from "node:net";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { authHmac, getClientAddress } from "@/lib/auth/security";

type RateLimitRule = {
  action: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

const EXPIRED_RATE_LIMIT_CLEANUP_BATCH_SIZE = 50;

function getTrustedClientAddress(request: Request) {
  const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : null;
  if (!address || address.includes("%")) return "unknown";
  const version = isIP(address);
  if (version === 6) return new URL(`http://[${address}]`).hostname;
  return version === 4 ? address : "unknown";
}

async function deleteExpiredRateLimitRows(
  tx: Prisma.TransactionClient,
  now: Date
) {
  await tx.$executeRaw`
    WITH expired AS (
      SELECT "keyHash"
      FROM "AuthRateLimit"
      WHERE "expiresAt" <= ${now}
      ORDER BY "expiresAt" ASC
      LIMIT ${EXPIRED_RATE_LIMIT_CLEANUP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "AuthRateLimit" AS rate_limit
    USING expired
    WHERE rate_limit."keyHash" = expired."keyHash"
  `;
}

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
  scope = "origin",
}: {
  request: Request;
  subject: string;
  rule: RateLimitRule;
  now?: Date;
  scope?: "origin" | "account" | "trusted-origin";
}) {
  const address = scope === "account"
    ? "all"
    : scope === "trusted-origin"
      ? getTrustedClientAddress(request)
      : getClientAddress(request);
  const keyHash = authHmac(`${rule.action}\0${address}\0${subject}`);

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        if (scope !== "origin") {
          await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))`;
        }
        await deleteExpiredRateLimitRows(tx, now);
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
      { isolationLevel: scope === "origin" ? Prisma.TransactionIsolationLevel.Serializable : Prisma.TransactionIsolationLevel.ReadCommitted }
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

const loginBudgets = {
  admin: { perOrigin: 5, total: 30 },
  "native-google": { perOrigin: 15, total: 300 },
} as const;

/** Reserve a slot before authentication work so concurrent requests count too. */
export async function consumeLoginBudget(request: Request, flow: keyof typeof loginBudgets, now = new Date()) {
  const { perOrigin, total } = loginBudgets[flow];
  const interval = { windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
  const origin = await consumeAuthRateLimit({
    request, subject: flow, now, scope: "trusted-origin",
    rule: { action: `${flow}-origin`, limit: perOrigin, ...interval },
  });
  if (!origin.allowed) return origin;
  return consumeAuthRateLimit({
    request, subject: flow, now, scope: "account",
    rule: { action: `${flow}-global`, limit: total, ...interval },
  });
}
