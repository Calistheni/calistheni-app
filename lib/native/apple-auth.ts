"use client";

import { registerPlugin } from "@capacitor/core";
import { isIOSApp, isNativePluginAvailable } from "@/lib/native/platform";

type AppleAuthorizationResult = {
  state: string;
  identityToken: string;
  authorizationCode: string;
  givenName?: string;
  familyName?: string;
};

type CalistheniAppleAuthPlugin = {
  authorize(options: { state: string; nonce: string }): Promise<AppleAuthorizationResult>;
  getCredentialState(): Promise<{ state: "authorized" | "revoked" | "notFound" | "transferred" | "notStored" | "unknown" }>;
};

const PLUGIN_NAME = "CalistheniAppleAuth";
const AppleAuth = registerPlugin<CalistheniAppleAuthPlugin>(PLUGIN_NAME);

export function canUseNativeAppleAuth() {
  return isIOSApp() && isNativePluginAvailable(PLUGIN_NAME);
}

export async function performNativeAppleAuth(intent: "login" | "link") {
  if (!canUseNativeAppleAuth()) throw new Error("APPLE_AUTH_UNAVAILABLE");
  const start = await fetch("/api/auth/apple/native/start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent }),
  });
  const challenge = (await start.json()) as { state?: string; nonce?: string; error?: string };
  if (!start.ok || !challenge.state || !challenge.nonce) {
    throw new Error(challenge.error ?? "APPLE_AUTH_START_FAILED");
  }
  const credential = await AppleAuth.authorize({ state: challenge.state, nonce: challenge.nonce });
  if (credential.state !== challenge.state) throw new Error("APPLE_AUTH_STATE_INVALID");
  const completion = await fetch("/api/auth/apple/native/complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credential, nonce: challenge.nonce }),
  });
  const result = (await completion.json()) as {
    ok?: boolean;
    linked?: boolean;
    redirectTo?: string;
    error?: string;
  };
  if (!completion.ok || !result.ok) throw new Error(result.error ?? "APPLE_AUTH_FAILED");
  return result;
}

export async function checkNativeAppleCredentialState() {
  if (!canUseNativeAppleAuth()) return "notStored" as const;
  return (await AppleAuth.getCredentialState()).state;
}
