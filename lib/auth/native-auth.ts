/** The only public Universal/App Link accepted from the system browser. */
export const NATIVE_AUTH_CALLBACK_PATH = "/auth/mobile/callback";
export const NATIVE_AUTH_COMPLETION_PATH = "/api/auth/mobile/complete";
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
    value.includes("\\") ||
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

export function isNativeAuthCallbackUrl(value: string, expectedOrigin = "https://calistheni.app") {
  try {
    const url = new URL(value);
    return (
      url.origin === expectedOrigin &&
      url.protocol === "https:" &&
      url.pathname === NATIVE_AUTH_CALLBACK_PATH &&
      isNativeAuthCode(url.searchParams.get("code"))
    );
  } catch {
    return false;
  }
}

/** 256-bit base64url secret produced by createNativeAuthSecret(). */
export function isNativeAuthCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
