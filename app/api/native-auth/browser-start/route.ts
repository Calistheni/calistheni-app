import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashNativeAuthSecret, logNativeAuth, setNativeAuthAttemptCookie } from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt");
  const nonce = url.searchParams.get("nonce");
  if (!attemptId || !nonce) {
    return NextResponse.redirect(new URL("/login?nativeAuthError=invalid", getSiteUrl()));
  }

  const attempt = await prisma.nativeAuthAttempt.findFirst({
    where: {
      id: attemptId,
      nonceHash: hashNativeAuthSecret(nonce),
      expiresAt: { gt: new Date() },
      consumedAt: null,
      handoffCodeHash: null,
    },
    select: { id: true },
  });
  if (!attempt) {
    logNativeAuth("browser_start_rejected", { attemptId });
    return NextResponse.redirect(new URL("/login?nativeAuthError=expired", getSiteUrl()));
  }

  const startPage = new URL("/mobile/auth/start", getSiteUrl());
  startPage.searchParams.set("attempt", attempt.id);
  startPage.searchParams.set("nonce", nonce);
  const response = NextResponse.redirect(startPage);
  setNativeAuthAttemptCookie(response, attempt.id, nonce);
  logNativeAuth("external_authorization_started", { attemptId });
  return response;
}
