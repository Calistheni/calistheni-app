import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NATIVE_AUTH_CALLBACK_PATH } from "@/lib/auth/native-auth";
import {
  clearNativeAuthAttemptCookie,
  createNativeAuthSecret,
  hashNativeAuthSecret,
  logNativeAuth,
  parseNativeAuthAttemptCookie,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
const HANDOFF_TTL_MS = 5 * 60 * 1000;

function errorRedirect(code: string) {
  const url = new URL(NATIVE_AUTH_CALLBACK_PATH, getSiteUrl());
  url.searchParams.set("error", code);
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const attemptId = requestUrl.searchParams.get("attempt");
  const nonce = requestUrl.searchParams.get("nonce");
  const browserAttempt = parseNativeAuthAttemptCookie(
    request.headers.get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("calistheni.native-auth-attempt="))
      ?.slice("calistheni.native-auth-attempt=".length)
  );
  const session = await auth();

  if (
    !attemptId ||
    !nonce ||
    !browserAttempt ||
    browserAttempt.attemptId !== attemptId ||
    browserAttempt.nonce !== nonce ||
    !session?.user?.id
  ) {
    logNativeAuth("provider_callback_rejected", { attemptId: attemptId ?? "missing" });
    const response = NextResponse.redirect(errorRedirect("authentication_failed"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const handoffCode = createNativeAuthSecret();
  const now = new Date();
  const updated = await prisma.nativeAuthAttempt.updateMany({
    where: {
      id: attemptId,
      nonceHash: hashNativeAuthSecret(nonce),
      expiresAt: { gt: now },
      handoffCodeHash: null,
      consumedAt: null,
    },
    data: {
      userId: session.user.id,
      handoffCodeHash: hashNativeAuthSecret(handoffCode),
      handoffIssuedAt: now,
      // The pre-OAuth attempt has a longer setup lifetime; the usable browser
      // handoff itself is intentionally limited to five minutes.
      expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS),
    },
  });

  if (updated.count !== 1) {
    logNativeAuth("handoff_issue_rejected", { attemptId });
    const response = NextResponse.redirect(errorRedirect("attempt_expired"));
    clearNativeAuthAttemptCookie(response);
    return response;
  }

  const callbackUrl = new URL(NATIVE_AUTH_CALLBACK_PATH, getSiteUrl());
  callbackUrl.searchParams.set("code", handoffCode);
  const response = NextResponse.redirect(callbackUrl);
  clearNativeAuthAttemptCookie(response);
  logNativeAuth("handoff_issued", { attemptId, userId: session.user.id });
  return response;
}
