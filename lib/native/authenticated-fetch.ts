"use client";

import { registerPlugin } from "@capacitor/core";

type SecureSessionPlugin = {
  getSessionToken(): Promise<{ token: string | null }>;
};

const SecureSession = registerPlugin<SecureSessionPlugin>("CalistheniSecureSession");

/** Keeps existing remote/cookie behavior while making shared native bridges bearer-ready. */
export async function nativeAuthenticatedFetch(path: string, init: RequestInit = {}) {
  if (typeof window === "undefined" || window.location.protocol !== "capacitor:") {
    return fetch(path, init);
  }
  const origin = process.env.NEXT_PUBLIC_CALISTHENI_API_ORIGIN?.trim() || "https://calistheni.app";
  const headers = new Headers(init.headers);
  const { token } = await SecureSession.getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(new URL(path, origin), { ...init, headers });
}
