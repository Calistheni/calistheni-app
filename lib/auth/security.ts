import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { getSiteUrl } from "@/lib/site-url";
export { DUMMY_PASSWORD_HASH, hashPassword, normalizeAuthEmail, validatePassword, verifyPassword } from "@/lib/auth/password-core";
export { decryptAuthToken, encryptAuthToken, type EncryptedAuthToken } from "@/lib/auth/token-encryption";

export function createAuthSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashAuthSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getAuthHmacSecret() {
  const value =
    process.env.AUTH_RATE_LIMIT_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_RATE_LIMIT_SECRET or AUTH_SECRET is required.");
  return value;
}

export function authHmac(value: string) {
  return createHmac("sha256", getAuthHmacSecret()).update(value).digest("hex");
}

export function getClientAddress(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function assertTrustedAuthOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set([
    new URL(request.url).origin,
    new URL(getSiteUrl()).origin,
  ]);
  if (!origin || !allowed.has(origin)) throw new Error("AUTH_ORIGIN_INVALID");
}
