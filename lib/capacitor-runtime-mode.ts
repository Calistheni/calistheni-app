export const REMOTE_CAPACITOR_WEB_DIR = "mobile-web";
export const BUNDLED_CAPACITOR_WEB_DIR = "apps/native/out";
export const DEFAULT_CAPACITOR_SERVER_URL = "https://calistheni.app";
export const STAGING_CAPACITOR_SERVER_URL =
  "https://calistheni-staging.vercel.app";

export const CAPACITOR_REMOTE_TARGETS = {
  production: DEFAULT_CAPACITOR_SERVER_URL,
  staging: STAGING_CAPACITOR_SERVER_URL,
} as const;

export type CapacitorRemoteTarget = keyof typeof CAPACITOR_REMOTE_TARGETS;
export type CapacitorLoggingBehavior = "none";

type CapacitorEnvironment = Record<string, string | undefined>;

export type CapacitorRuntimeMode =
  | {
      kind: "remote";
      webDir: typeof REMOTE_CAPACITOR_WEB_DIR;
      target: CapacitorRemoteTarget | "custom";
      serverUrl: string;
    }
  | {
      kind: "bundled";
      webDir: typeof BUNDLED_CAPACITOR_WEB_DIR;
      serverUrl?: never;
    };

/**
 * Bundled mode is deliberately opt-in. An invalid non-empty flag is rejected
 * so a mistyped release command cannot silently select the wrong runtime.
 */
export function resolveCapacitorRuntimeMode(
  environment: CapacitorEnvironment
): CapacitorRuntimeMode {
  const bundledFlag = environment.CALISTHENI_BUNDLED_NATIVE?.trim();
  const remoteTarget = environment.CALISTHENI_NATIVE_REMOTE_TARGET?.trim();
  const customServerUrl = environment.CAPACITOR_SERVER_URL?.trim();

  if (
    bundledFlag !== undefined &&
    bundledFlag !== "" &&
    bundledFlag !== "0" &&
    bundledFlag !== "1"
  ) {
    throw new Error(
      "CALISTHENI_BUNDLED_NATIVE must be 1 (bundled) or 0/unset (remote)."
    );
  }

  if (bundledFlag === "1") {
    return { kind: "bundled", webDir: BUNDLED_CAPACITOR_WEB_DIR };
  }

  if (
    remoteTarget !== "production" &&
    remoteTarget !== "staging" &&
    remoteTarget !== "custom"
  ) {
    throw new Error(
      "CALISTHENI_NATIVE_REMOTE_TARGET must explicitly be production, staging, or custom."
    );
  }

  if (remoteTarget === "custom") {
    if (!customServerUrl) {
      throw new Error(
        "CAPACITOR_SERVER_URL is required when CALISTHENI_NATIVE_REMOTE_TARGET=custom."
      );
    }
    return {
      kind: "remote",
      webDir: REMOTE_CAPACITOR_WEB_DIR,
      target: "custom",
      serverUrl: customServerUrl,
    };
  }

  if (customServerUrl) {
    throw new Error(
      "CAPACITOR_SERVER_URL cannot override a named staging or production native target."
    );
  }

  return {
    kind: "remote",
    webDir: REMOTE_CAPACITOR_WEB_DIR,
    target: remoteTarget,
    serverUrl: CAPACITOR_REMOTE_TARGETS[remoteTarget],
  };
}

export function resolveCapacitorLoggingBehavior(
  environment: CapacitorEnvironment
): CapacitorLoggingBehavior {
  const behavior = environment.CALISTHENI_CAPACITOR_LOGGING?.trim();
  if (behavior !== "none") {
    throw new Error(
      "CALISTHENI_CAPACITOR_LOGGING must be none because native bridge responses can contain credentials."
    );
  }
  return behavior;
}
