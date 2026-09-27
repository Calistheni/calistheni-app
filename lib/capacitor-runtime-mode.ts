export const REMOTE_CAPACITOR_WEB_DIR = "mobile-web";
export const BUNDLED_CAPACITOR_WEB_DIR = "apps/native/out";
export const DEFAULT_CAPACITOR_SERVER_URL = "https://calistheni.app";

type CapacitorEnvironment = Record<string, string | undefined>;

export type CapacitorRuntimeMode =
  | {
      kind: "remote";
      webDir: typeof REMOTE_CAPACITOR_WEB_DIR;
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

  return {
    kind: "remote",
    webDir: REMOTE_CAPACITOR_WEB_DIR,
    serverUrl:
      environment.CAPACITOR_SERVER_URL ?? DEFAULT_CAPACITOR_SERVER_URL,
  };
}
