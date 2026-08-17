import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  NATIVE_AUTH_ATTEMPT_TTL_MS,
  isNativeAuthPlatform,
  sanitizeNativeRedirectPath,
} from "@/lib/auth/native-auth";
import {
  createNativeAuthSecret,
  hashNativeAuthSecret,
  logNativeAuth,
} from "@/lib/auth/native-auth-server";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(getSiteUrl()).origin;
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      {
        error: "Native authentication must start from Calistheni.",
        code: "NATIVE_AUTH_ORIGIN_INVALID",
      },
      { status: 403 }
    );
  }

  let body: { platform?: unknown; redirectTo?: unknown; intent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid native authentication request.",
        code: "NATIVE_AUTH_REQUEST_INVALID",
      },
      { status: 400 }
    );
  }

  if (!isNativeAuthPlatform(body.platform)) {
    return NextResponse.json(
      {
        error: "Unsupported native platform.",
        code: "NATIVE_AUTH_PLATFORM_INVALID",
      },
      { status: 400 }
    );
  }
  // This endpoint currently starts fresh interactive logins only. Keep the
  // intent explicit so a future same-account reauthentication flow cannot
  // accidentally inherit this browser-session reset.
  if (body.intent !== "login") {
    return NextResponse.json(
      {
        error: "Unsupported native authentication intent.",
        code: "NATIVE_AUTH_INTENT_INVALID",
      },
      { status: 400 }
    );
  }
  const platform = body.platform;

  const now = new Date();
  const nonce = createNativeAuthSecret();
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.nativeAuthAttempt.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return tx.nativeAuthAttempt.create({
      data: {
        platform,
        nonceHash: hashNativeAuthSecret(nonce),
        redirectPath: sanitizeNativeRedirectPath(body.redirectTo),
        expiresAt: new Date(now.getTime() + NATIVE_AUTH_ATTEMPT_TTL_MS),
      },
      select: { id: true },
    });
  });

  const startUrl = new URL("/api/native-auth/browser-start", getSiteUrl());
  startUrl.searchParams.set("attempt", attempt.id);
  startUrl.searchParams.set("nonce", nonce);
  startUrl.searchParams.set("intent", "login");

  logNativeAuth("attempt_created", {
    attemptId: attempt.id,
    platform,
    intent: "login",
  });

  return NextResponse.json({
    attemptId: attempt.id,
    externalAuthUrl: startUrl.toString(),
  });
}
