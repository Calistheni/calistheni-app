"use client";

import { registerPlugin } from "@capacitor/core";

type SecureSessionPlugin = {
  setSessionToken(options: { token: string }): Promise<void>;
};

const SecureSession = registerPlugin<SecureSessionPlugin>("CalistheniSecureSession");

/**
 * Opt-in cutover hook for a future remote-runtime release. It is deliberately
 * not called automatically until that staged release is approved.
 */
export async function enrollCurrentWebSessionForBundledNative() {
  const response = await fetch("/api/native/v1/auth/enroll", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const payload = (await response.json()) as { token?: string; error?: string };
  if (!response.ok || !payload.token) {
    throw new Error(payload.error ?? "Unable to prepare this account for bundled mode.");
  }
  await SecureSession.setSessionToken({ token: payload.token });
}
