import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";

export const NATIVE_AUTH_BROWSER_COOKIE = "calistheni.native-auth-attempt";
export const NATIVE_AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function createNativeAuthSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashNativeAuthSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getNativeAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(getSiteUrl()).protocol === "https:",
    path: "/",
    maxAge,
  };
}

/** Auth.js v5's database-session cookie name, matched to its secure-cookie rule. */
export function getAuthSessionCookieName() {
  return new URL(getSiteUrl()).protocol === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function setNativeAuthAttemptCookie(
  response: NextResponse,
  attemptId: string,
  nonce: string
) {
  response.cookies.set(
    NATIVE_AUTH_BROWSER_COOKIE,
    `${attemptId}.${nonce}`,
    getNativeAuthCookieOptions(10 * 60)
  );
}

export function clearNativeAuthAttemptCookie(response: NextResponse) {
  response.cookies.set(NATIVE_AUTH_BROWSER_COOKIE, "", {
    ...getNativeAuthCookieOptions(0),
    expires: new Date(0),
  });
}

export function parseNativeAuthAttemptCookie(value?: string) {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0 || separator === value.length - 1) return null;
  return {
    attemptId: value.slice(0, separator),
    nonce: value.slice(separator + 1),
  };
}

export function logNativeAuth(event: string, detail: Record<string, unknown>) {
  // Never put the raw nonce, handoff code, OAuth code, or session token here.
  console.info("[native-auth]", { event, ...detail });
}
