/** The only public Universal/App Link accepted from the system browser. */
export const NATIVE_AUTH_CALLBACK_PATH = "/auth/mobile/callback";
export const NATIVE_AUTH_COMPLETION_PATH = "/api/auth/mobile/complete";
export const NATIVE_AUTH_CUSTOM_SCHEME = "calistheni:";
export const NATIVE_AUTH_DEFAULT_REDIRECT = "/home";
export const NATIVE_AUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;

const DISALLOWED_NATIVE_REDIRECT_PREFIXES = [
  "/api",
  "/login",
  "/mobile/auth",
];

/** Only relative, in-app destinations are valid after a native handoff. */
export function sanitizeNativeRedirectPath(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value) ||
    DISALLOWED_NATIVE_REDIRECT_PREFIXES.some((prefix) =>
      value.startsWith(prefix)
    )
  ) {
    return NATIVE_AUTH_DEFAULT_REDIRECT;
  }

  return value;
}

export function isNativeAuthPlatform(value: unknown): value is "IOS" | "ANDROID" {
  return value === "IOS" || value === "ANDROID";
}

export type NativeAuthCallbackPayload = { attempt: string };

export function isNativeAuthAttemptId(value: unknown): value is string {
  return typeof value === "string" && /^c[a-z0-9]{24}$/.test(value);
}

/**
 * Parses the two deliberately narrow native return locations. URL treats
 * `calistheni://auth/mobile/callback` as host `auth`, path `/mobile/callback`.
 */
export function parseNativeAuthCallbackUrl(
  value: string,
  expectedOrigin = "https://calistheni.app"
): NativeAuthCallbackPayload | null {
  try {
    const url = new URL(value);
    const isHttpsCallback =
      url.protocol === "https:" &&
      url.origin === expectedOrigin &&
      url.pathname === NATIVE_AUTH_CALLBACK_PATH;
    const isCustomSchemeCallback =
      url.protocol === NATIVE_AUTH_CUSTOM_SCHEME &&
      url.hostname === "auth" &&
      url.pathname === "/mobile/callback" &&
      !url.username &&
      !url.password &&
      !url.port;
    const attempt = url.searchParams.get("attempt");
    return (isHttpsCallback || isCustomSchemeCallback) && isNativeAuthAttemptId(attempt)
      ? { attempt }
      : null;
  } catch {
    return null;
  }
}

export function isNativeAuthCallbackUrl(value: string, expectedOrigin = "https://calistheni.app") {
  return parseNativeAuthCallbackUrl(value, expectedOrigin) !== null;
}

export function createNativeAuthCustomSchemeUrl(attempt: string) {
  const url = new URL("calistheni://auth/mobile/callback");
  url.searchParams.set("attempt", attempt);
  return url.toString();
}

/** 256-bit base64url secret produced by createNativeAuthSecret(). */
export function isNativeAuthCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isNativeAuthVerifierChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export async function createNativeAuthProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const verifierChallenge = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { verifier, verifierChallenge };
}
