"use client";

import { nativeClientConfig } from "./config";
import { getNativeSessionToken } from "./secure-session";

export class NativeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null
  ) {
    super(message);
    this.name = "NativeApiError";
  }
}

export function apiUrl(path: string) {
  if (!path.startsWith("/")) throw new Error("Native API paths must be absolute.");
  return new URL(path, nativeClientConfig.apiOrigin).toString();
}

export function assetUrl(value: string | null) {
  return value ? new URL(value, nativeClientConfig.apiOrigin).toString() : null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean } = {}
): Promise<T> {
  const { authenticated = true, headers: inputHeaders, ...init } = options;
  const headers = new Headers(inputHeaders);
  if (authenticated) {
    const token = await getNativeSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(apiUrl(path), { ...init, headers });
  const payload = await response.json().catch(() => null) as T & { error?: string; code?: string } | null;
  if (!response.ok) {
    // A rejected unauthenticated handoff is not evidence that an existing
    // bearer session is invalid. Only protected requests may revoke local auth.
    if (authenticated && response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("calistheni:native-session-unauthorized"));
    }
    throw new NativeApiError(
      payload?.error ?? "Calistheni is unavailable right now.",
      response.status,
      payload?.code ?? null
    );
  }
  return payload as T;
}
