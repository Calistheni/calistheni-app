"use client";

import { registerPlugin } from "@capacitor/core";

type SecureSessionPlugin = {
  getSessionToken(): Promise<{ token: string | null }>;
  setSessionToken(options: { token: string }): Promise<void>;
  clearSessionToken(): Promise<void>;
};

const SecureSession = registerPlugin<SecureSessionPlugin>("CalistheniSecureSession");

export async function getNativeSessionToken() {
  return (await SecureSession.getSessionToken()).token;
}

export async function setNativeSessionToken(token: string) {
  await SecureSession.setSessionToken({ token });
}

export async function clearNativeSessionToken() {
  await SecureSession.clearSessionToken();
}
