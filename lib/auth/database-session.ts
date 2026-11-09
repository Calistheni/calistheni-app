import "server-only";

import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createAuthSecret, hashAuthSecret } from "@/lib/auth/security";
import {
  getAuthSessionCookieName,
  getNativeAuthCookieOptions,
  NATIVE_AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/native-auth-server";

export const RECENT_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

export function readAuthSessionToken(request: Request) {
  const name = getAuthSessionCookieName();
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export async function getDatabaseSessionFromRequest(request: Request) {
  const sessionToken = readAuthSessionToken(request);
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken, purpose: "APPLICATION" },
    include: { user: true },
  });
  if (!session || session.expires <= new Date() || session.user.deletedAt) return null;
  return { ...session, sessionTokenHash: hashAuthSecret(sessionToken) };
}

export function isRecentAuthentication(
  authenticatedAt: Date | null,
  now = new Date()
) {
  return Boolean(
    authenticatedAt &&
      authenticatedAt.getTime() >= now.getTime() - RECENT_AUTH_MAX_AGE_MS
  );
}

export async function createDatabaseSession(
  userId: string,
  now = new Date(),
  authProvider?: "apple" | "google" | "password"
) {
  const sessionToken = createAuthSecret();
  await prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
    await tx.session.create({
      data: {
        sessionToken,
        userId,
        authenticatedAt: now,
        purpose: "APPLICATION",
        authProvider,
        expires: new Date(
          now.getTime() + NATIVE_AUTH_SESSION_MAX_AGE_SECONDS * 1000
        ),
      },
    });
  });
  return sessionToken;
}

export function setDatabaseSessionCookie(
  response: NextResponse,
  sessionToken: string
) {
  response.cookies.set(
    getAuthSessionCookieName(),
    sessionToken,
    getNativeAuthCookieOptions(NATIVE_AUTH_SESSION_MAX_AGE_SECONDS)
  );
}

export async function markSessionRecentlyAuthenticated(request: Request) {
  const sessionToken = readAuthSessionToken(request);
  if (!sessionToken) return false;
  const result = await prisma.session.updateMany({
    where: { sessionToken, purpose: "APPLICATION", expires: { gt: new Date() } },
    data: { authenticatedAt: new Date() },
  });
  return result.count === 1;
}

export async function markCurrentSessionRecentlyAuthenticated() {
  const sessionToken = (await cookies()).get(getAuthSessionCookieName())?.value;
  if (!sessionToken) return false;
  const result = await prisma.session.updateMany({
    where: { sessionToken, purpose: "APPLICATION", expires: { gt: new Date() } },
    data: { authenticatedAt: new Date() },
  });
  return result.count === 1;
}
