import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const ADMIN_AUTH_COOKIE_NAME = "calistheni-admin-session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_BLOCK_MS = 15 * 60 * 1000;

type AdminLoginAttemptState = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
};

const globalForAdminAuth = globalThis as typeof globalThis & {
  adminLoginAttempts?: Map<string, AdminLoginAttemptState>;
};

const adminLoginAttempts =
  globalForAdminAuth.adminLoginAttempts ??
  new Map<string, AdminLoginAttemptState>();

if (!globalForAdminAuth.adminLoginAttempts) {
  globalForAdminAuth.adminLoginAttempts = adminLoginAttempts;
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD;
}

function pruneExpiredLoginAttempts(now: number) {
  for (const [key, state] of adminLoginAttempts.entries()) {
    const windowExpired = now - state.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS;
    const blockExpired =
      state.blockedUntil !== null && state.blockedUntil <= now;

    if (windowExpired || blockExpired) {
      adminLoginAttempts.delete(key);
    }
  }
}

async function getAdminLoginRateLimitKey() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const realIp = requestHeaders.get("x-real-ip");
  const userAgent = requestHeaders.get("user-agent") ?? "unknown-user-agent";
  const ip =
    forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown-ip";

  return `${ip}:${userAgent}`;
}

function signAdminSession(expiresAt: number) {
  const password = getAdminPassword();

  if (!password) {
    throw new Error("ADMIN_PASSWORD is not configured.");
  }

  return createHmac("sha256", password)
    .update(`admin-session:${expiresAt}`)
    .digest("base64url");
}

function verifyAdminSessionToken(token: string | undefined) {
  if (!token) {
    return false;
  }

  const [expiresAtRaw, signature] = token.split(".");

  if (!expiresAtRaw || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const expectedSignature = signAdminSession(expiresAt);
  const providedSignatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer);
}

function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export function validateAdminPassword(password: string) {
  const expectedPassword = getAdminPassword();

  if (!expectedPassword) {
    return false;
  }

  const passwordBuffer = Buffer.from(password);
  const expectedPasswordBuffer = Buffer.from(expectedPassword);

  if (passwordBuffer.length !== expectedPasswordBuffer.length) {
    return false;
  }

  return timingSafeEqual(passwordBuffer, expectedPasswordBuffer);
}

export async function getAdminLoginRateLimitStatus() {
  const now = Date.now();
  pruneExpiredLoginAttempts(now);

  const key = await getAdminLoginRateLimitKey();
  const state = adminLoginAttempts.get(key);

  if (!state || state.blockedUntil === null || state.blockedUntil <= now) {
    return {
      limited: false,
      retryAfterMs: 0,
    };
  }

  return {
    limited: true,
    retryAfterMs: state.blockedUntil - now,
  };
}

export async function recordFailedAdminLoginAttempt() {
  const now = Date.now();
  pruneExpiredLoginAttempts(now);

  const key = await getAdminLoginRateLimitKey();
  const state = adminLoginAttempts.get(key);

  if (!state || now - state.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
    adminLoginAttempts.set(key, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: null,
    });
    return;
  }

  const nextCount = state.count + 1;

  adminLoginAttempts.set(key, {
    count: nextCount,
    firstAttemptAt: state.firstAttemptAt,
    blockedUntil:
      nextCount >= ADMIN_LOGIN_MAX_ATTEMPTS ? now + ADMIN_LOGIN_BLOCK_MS : null,
  });
}

export async function clearFailedAdminLoginAttempts() {
  const key = await getAdminLoginRateLimitKey();
  adminLoginAttempts.delete(key);
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const signature = signAdminSession(expiresAt);

  cookieStore.set(
    ADMIN_AUTH_COOKIE_NAME,
    `${expiresAt}.${signature}`,
    getAdminCookieOptions()
  );
}

export async function isAdminAuthenticated() {
  if (!getAdminPassword()) {
    return false;
  }

  const cookieStore = await cookies();

  return verifyAdminSessionToken(
    cookieStore.get(ADMIN_AUTH_COOKIE_NAME)?.value
  );
}

export async function clearAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_AUTH_COOKIE_NAME, "", {
    ...getAdminCookieOptions(),
    maxAge: 0,
  });
}

export function createUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
