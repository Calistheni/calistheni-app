export const NATIVE_APPLE_AUTH_STAGES = [
  "identity_token_verification",
  "authorization_code_exchange",
  "exchanged_token_verification",
  "account_resolution",
  "authorization_persistence",
  "session_creation",
] as const;

export type NativeAppleAuthStage = (typeof NATIVE_APPLE_AUTH_STAGES)[number];

const APPLE_OAUTH_ERROR_CATEGORIES = [
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "unauthorized_client",
  "unsupported_grant_type",
] as const;

export type AppleOAuthErrorCategory =
  | (typeof APPLE_OAUTH_ERROR_CATEGORIES)[number]
  | "unknown";

const appleOAuthErrorCategories = new Set<string>(APPLE_OAUTH_ERROR_CATEGORIES);

export function classifyAppleOAuthError(value: unknown): AppleOAuthErrorCategory {
  return typeof value === "string" && appleOAuthErrorCategories.has(value)
    ? (value as AppleOAuthErrorCategory)
    : "unknown";
}

export class AppleOAuthExchangeError extends Error {
  readonly oauthError: AppleOAuthErrorCategory;

  constructor(oauthError: AppleOAuthErrorCategory) {
    super("APPLE_CODE_EXCHANGE_FAILED");
    this.name = "AppleOAuthExchangeError";
    this.oauthError = oauthError;
  }
}

export class NativeAppleAuthStageError extends Error {
  readonly stage: NativeAppleAuthStage;
  readonly oauthError: AppleOAuthErrorCategory;

  constructor(
    stage: NativeAppleAuthStage,
    oauthError: AppleOAuthErrorCategory = "unknown"
  ) {
    super("NATIVE_APPLE_AUTH_STAGE_FAILED");
    this.name = "NativeAppleAuthStageError";
    this.stage = stage;
    this.oauthError = oauthError;
  }
}

export async function runNativeAppleAuthStage<T>(
  stage: NativeAppleAuthStage,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof NativeAppleAuthStageError) throw error;
    throw new NativeAppleAuthStageError(
      stage,
      error instanceof AppleOAuthExchangeError ? error.oauthError : "unknown"
    );
  }
}

export function getNativeAppleAuthDiagnostic(
  error: unknown,
  fallbackStage: NativeAppleAuthStage
) {
  return error instanceof NativeAppleAuthStageError
    ? { stage: error.stage, oauthError: error.oauthError }
    : { stage: fallbackStage, oauthError: "unknown" as const };
}
