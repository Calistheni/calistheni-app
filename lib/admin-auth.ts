import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { consumeLoginBudget } from "@/lib/auth/rate-limit";

const ADMIN_AUTH_COOKIE_NAME = "calistheni-admin-session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
function getAdminPassword() {
  return process.env.ADMIN_PASSWORD;
}

function signAdminSession(expiresAt: number, encodedActor?: string) {
  const password = getAdminPassword();

  if (!password) {
    throw new Error("ADMIN_PASSWORD is not configured.");
  }

  return createHmac("sha256", password)
    .update(
      encodedActor
        ? `admin-session:${expiresAt}:${encodedActor}`
        : `admin-session:${expiresAt}`
    )
    .digest("base64url");
}

function verifyAdminSessionToken(token: string | undefined) {
  if (!token) {
    return { valid: false, actorLabel: null };
  }

  const parts = token.split(".");
  if (parts.length !== 2 && parts.length !== 3) {
    return { valid: false, actorLabel: null };
  }
  const [expiresAtRaw] = parts;
  const encodedActor = parts.length === 3 ? parts[1] : undefined;
  const signature = parts.length === 3 ? parts[2] : parts[1];

  if (!expiresAtRaw || !signature) {
    return { valid: false, actorLabel: null };
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { valid: false, actorLabel: null };
  }

  const expectedSignature = signAdminSession(expiresAt, encodedActor);
  const providedSignatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
    return { valid: false, actorLabel: null };
  }

  if (!timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)) {
    return { valid: false, actorLabel: null };
  }

  let actorLabel: string | null = null;
  if (encodedActor) {
    try {
      actorLabel = Buffer.from(encodedActor, "base64url").toString("utf8");
    } catch {
      actorLabel = null;
    }
  }

  return { valid: true, actorLabel };
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

export async function authorizeAdminLogin(request: Request, password: unknown) {
  try {
    const budget = await consumeLoginBudget(request, "admin");
    if (!budget.allowed) return false;
    return typeof password === "string" && validateAdminPassword(password);
  } catch {
    // Fail closed when durable throttling cannot reserve an attempt.
    return false;
  }
}

export async function createAdminSession(actorLabel: string) {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const encodedActor = Buffer.from(actorLabel.trim()).toString("base64url");
  const signature = signAdminSession(expiresAt, encodedActor);

  cookieStore.set(
    ADMIN_AUTH_COOKIE_NAME,
    `${expiresAt}.${encodedActor}.${signature}`,
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
  ).valid;
}

export async function getAdminActorLabel() {
  const cookieStore = await cookies();
  const session = verifyAdminSessionToken(
    cookieStore.get(ADMIN_AUTH_COOKIE_NAME)?.value
  );
  const configuredLabel = process.env.ADMIN_DISPLAY_NAME?.trim();
  return session.actorLabel?.trim() || configuredLabel || "Administrator";
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
