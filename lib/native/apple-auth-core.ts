export type AppleAuthorizationResult = {
  state: string;
  identityToken: string;
  authorizationCode: string;
  givenName?: string;
  familyName?: string;
};

export type NativeAppleAuthSuccess = {
  ok: true;
  linked?: boolean;
  redirectTo?: string;
};

export type NativeAppleAuthOutcome =
  | { status: "success"; result: NativeAppleAuthSuccess }
  | { status: "cancelled" };

export type NativeAppleAuthFailureKind = "authentication" | "network" | "server";

export class NativeAppleAuthError extends Error {
  constructor(
    readonly kind: NativeAppleAuthFailureKind,
    message: string
  ) {
    super(message);
    this.name = "NativeAppleAuthError";
  }
}

type NativeAppleAuthDependencies = {
  fetch: typeof fetch;
  authorize(options: { state: string; nonce: string }): Promise<AppleAuthorizationResult>;
};

type AppleChallenge = { state?: string; nonce?: string; error?: string };

const APPLE_AUTH_CANCELLED = "APPLE_AUTH_CANCELLED";

export function isNativeAppleAuthCancellation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === APPLE_AUTH_CANCELLED
  );
}

async function readJson<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    throw new NativeAppleAuthError("server", "APPLE_AUTH_RESPONSE_INVALID");
  }
}

async function request(
  fetchImplementation: typeof fetch,
  input: string,
  init: RequestInit
) {
  try {
    return await fetchImplementation(input, init);
  } catch {
    throw new NativeAppleAuthError("network", "APPLE_AUTH_NETWORK_FAILED");
  }
}

export async function performNativeAppleAuthFlow(
  intent: "login" | "link" | "reauth",
  dependencies: NativeAppleAuthDependencies
): Promise<NativeAppleAuthOutcome> {
  const start = await request(dependencies.fetch, "/api/auth/apple/native/start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent }),
  });
  const challenge = await readJson<AppleChallenge>(start);
  if (!start.ok || !challenge.state || !challenge.nonce) {
    throw new NativeAppleAuthError(
      "server",
      challenge.error ?? "APPLE_AUTH_START_FAILED"
    );
  }

  let credential: AppleAuthorizationResult;
  try {
    credential = await dependencies.authorize({
      state: challenge.state,
      nonce: challenge.nonce,
    });
  } catch (error) {
    if (isNativeAppleAuthCancellation(error)) return { status: "cancelled" };
    throw new NativeAppleAuthError("authentication", "APPLE_AUTH_FAILED");
  }

  if (credential.state !== challenge.state) {
    throw new NativeAppleAuthError("authentication", "APPLE_AUTH_STATE_INVALID");
  }

  const completion = await request(
    dependencies.fetch,
    "/api/auth/apple/native/complete",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...credential, nonce: challenge.nonce }),
    }
  );
  const result = await readJson<NativeAppleAuthSuccess & { error?: string }>(completion);
  if (!completion.ok || !result.ok) {
    throw new NativeAppleAuthError(
      "server",
      result.error ?? "APPLE_AUTH_FAILED"
    );
  }
  return { status: "success", result };
}

export function getAppleSignInErrorMessage(error: unknown) {
  if (error instanceof NativeAppleAuthError && error.kind === "network") {
    return "Unable to reach Apple sign-in. Check your connection and try again.";
  }
  return "Unable to sign in with Apple. Please try again.";
}
