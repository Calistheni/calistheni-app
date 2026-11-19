import { Browser } from "@capacitor/browser";
import { createNativeAuthProof, isNativeAuthAttemptId, isNativeAuthCode } from "@/lib/auth/native-auth";
import { getNativePlatform } from "@/lib/native/platform";

const storageKey = "calistheni.google-handoff";

export async function openNativeGoogleAuth(intent: "login" | "link" | "reauth", redirectTo: string) {
  const { verifier, verifierChallenge } = await createNativeAuthProof();
  const response = await fetch("/api/native-auth/attempt", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: getNativePlatform() === "ios" ? "IOS" : "ANDROID", intent, redirectTo, verifierChallenge }),
  });
  const result = await response.json();
  if (!response.ok || !isNativeAuthAttemptId(result.attemptId) ||
      !isNativeAuthCode(result.handoffCode) || typeof result.externalAuthUrl !== "string") {
    throw new Error("Unable to start Google sign-in. Please try again.");
  }
  const url = new URL(result.externalAuthUrl);
  if (url.origin !== window.location.origin || url.pathname !== "/api/native-auth/browser-start") {
    throw new Error("Unable to start Google sign-in. Please try again.");
  }
  sessionStorage.setItem(storageKey, JSON.stringify({
    attempt: result.attemptId, code: result.handoffCode, verifier, expiresAt: Date.now() + 15 * 60_000,
  }));
  try {
    await Browser.open({ url: url.toString(), presentationStyle: "fullscreen" });
  } catch {
    takeNativeGoogleHandoff(result.attemptId);
    throw new Error("Unable to open Google sign-in.");
  }
}

export function takeNativeGoogleHandoff(attempt: string) {
  const entry = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  if (entry?.attempt !== attempt) return null;
  sessionStorage.removeItem(storageKey);
  if (entry.expiresAt <= Date.now() || !isNativeAuthCode(entry.code) || !isNativeAuthCode(entry.verifier)) return null;
  return { attempt, code: entry.code, verifier: entry.verifier };
}
