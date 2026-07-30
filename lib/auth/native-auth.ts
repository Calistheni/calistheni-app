export const NATIVE_AUTH_CALLBACK_PATH = "/mobile/auth/complete";
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
      url.pathname === NATIVE_AUTH_CALLBACK_PATH
    );
  } catch {
    return false;
  }
}
