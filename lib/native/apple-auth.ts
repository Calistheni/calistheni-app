"use client";

import { registerPlugin } from "@capacitor/core";
import { isIOSApp, isNativePluginAvailable } from "@/lib/native/platform";
import {
  performNativeAppleAuthFlow,
  type AppleAuthorizationResult,
} from "@/lib/native/apple-auth-core";

type CalistheniAppleAuthPlugin = {
  authorize(options: { state: string; nonce: string }): Promise<AppleAuthorizationResult>;
  getCredentialState(): Promise<{ state: "authorized" | "revoked" | "notFound" | "transferred" | "notStored" | "unknown" }>;
};

const PLUGIN_NAME = "CalistheniAppleAuth";
const AppleAuth = registerPlugin<CalistheniAppleAuthPlugin>(PLUGIN_NAME);

export function canUseNativeAppleAuth() {
  return isIOSApp() && isNativePluginAvailable(PLUGIN_NAME);
}

export async function performNativeAppleAuth(intent: "login" | "link" | "reauth") {
  if (!canUseNativeAppleAuth()) throw new Error("APPLE_AUTH_UNAVAILABLE");
  return performNativeAppleAuthFlow(intent, {
    fetch,
    authorize: (options) => AppleAuth.authorize(options),
  });
}

export async function checkNativeAppleCredentialState() {
  if (!canUseNativeAppleAuth()) return "notStored" as const;
  return (await AppleAuth.getCredentialState()).state;
}
