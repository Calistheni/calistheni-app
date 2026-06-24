import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ADMIN_AUTH_COOKIE_NAME = "calistheni-admin-session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getAdminUsername() {
  return process.env.ADMIN_USERNAME;
}
function getAdminPassword() {
  return process.env.ADMIN_PASSWORD;
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
export function validateAdminCredentials(username: string, password: string) {
  const expectedUsername = getAdminUsername();
  const expectedPassword = getAdminPassword();

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  const usernameBuffer = Buffer.from(username);
  const expectedUsernameBuffer = Buffer.from(expectedUsername);

  const passwordBuffer = Buffer.from(password);
  const expectedPasswordBuffer = Buffer.from(expectedPassword);

  if (
    usernameBuffer.length !== expectedUsernameBuffer.length ||
    passwordBuffer.length !== expectedPasswordBuffer.length
  ) {
    return false;
  }

  return (
    timingSafeEqual(usernameBuffer, expectedUsernameBuffer) &&
    timingSafeEqual(passwordBuffer, expectedPasswordBuffer)
  );
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
