export type AuthEmailFailureCategory =
  | "PROVIDER_PERMANENT"
  | "PROVIDER_TRANSIENT"
  | "PROVIDER_CONFIGURATION"
  | "NETWORK"
  | "TOKEN_ENCRYPTION"
  | "UNKNOWN";

export const AUTH_EMAIL_MAX_ATTEMPTS = 12;
export const AUTH_EMAIL_MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export function authEmailRetryDelayMs(attempt: number) {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(AUTH_EMAIL_MAX_RETRY_DELAY_MS, 30_000 * 2 ** Math.min(safeAttempt - 1, 7));
}

export function classifyAuthEmailHttpStatus(status: number): {
  retryable: boolean;
  category: AuthEmailFailureCategory;
} {
  // Authentication/configuration failures are held for operator recovery rather
  // than discarded; address/content validation failures will not improve by retry.
  if (status === 401 || status === 403) {
    return { retryable: true, category: "PROVIDER_CONFIGURATION" };
  }
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return { retryable: true, category: "PROVIDER_TRANSIENT" };
  }
  if (status >= 400 && status < 500) {
    return { retryable: false, category: "PROVIDER_PERMANENT" };
  }
  return { retryable: true, category: "UNKNOWN" };
}

export function authEmailFailure(error: unknown): {
  retryable: boolean;
  category: AuthEmailFailureCategory;
} {
  if (error && typeof error === "object" && "retryable" in error && "category" in error) {
    const candidate = error as { retryable?: unknown; category?: unknown };
    if (typeof candidate.retryable === "boolean" && typeof candidate.category === "string") {
      const categories: AuthEmailFailureCategory[] = [
        "PROVIDER_PERMANENT", "PROVIDER_TRANSIENT", "PROVIDER_CONFIGURATION", "NETWORK", "TOKEN_ENCRYPTION", "UNKNOWN",
      ];
      if (categories.includes(candidate.category as AuthEmailFailureCategory)) {
        return { retryable: candidate.retryable, category: candidate.category as AuthEmailFailureCategory };
      }
    }
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { retryable: true, category: "NETWORK" };
  }
  return { retryable: true, category: "NETWORK" };
}

export function isAuthEmailActionUsable({
  deliveredAt,
  permanentlyFailedAt,
  consumedAt,
  expiresAt,
  deletedAt,
  now,
}: {
  deliveredAt: Date | null;
  permanentlyFailedAt: Date | null;
  consumedAt: Date | null;
  expiresAt: Date;
  deletedAt: Date | null;
  now: Date;
}) {
  return !deliveredAt && !permanentlyFailedAt && !consumedAt && expiresAt > now && !deletedAt;
}

export function isAuthEmailWorkerAuthorized(authorization: string | null, secrets: Array<string | undefined>) {
  if (!authorization) return false;
  const actualBuffer = Buffer.from(authorization);
  return secrets.some((secret) => {
    if (!secret || secret.length < 32) return false;
    const expectedBuffer = Buffer.from(`Bearer ${secret}`);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
}

export function authEmailQueueHealth({
  permanentlyFailed,
  expiredLeases,
  oldestPendingAgeSeconds,
}: {
  permanentlyFailed: number;
  expiredLeases: number;
  oldestPendingAgeSeconds: number | null;
}) {
  if (expiredLeases > 0 || (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= 60 * 60)) return "CRITICAL" as const;
  if (permanentlyFailed > 0 || (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= 10 * 60)) return "WARNING" as const;
  return "HEALTHY" as const;
}

/** Scheduled delivery remains disabled until an operator explicitly enables it. */
export function isAuthEmailWorkerEnabled(value = process.env.AUTH_EMAIL_WORKER_ENABLED) {
  return value === "true";
}

import { timingSafeEqual } from "node:crypto";
