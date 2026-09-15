import { NextResponse } from "next/server";
import { MAX_APPLE_SIGNED_PAYLOAD_LENGTH } from "@/lib/apple-iap/sync";
import { processAppleNotificationJws } from "@/lib/apple-iap/notifications";
import { AppleVerificationError } from "@/lib/apple-iap/verification";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let signedPayload: unknown;
  try {
    const body = (await request.json()) as { signedPayload?: unknown };
    signedPayload = body.signedPayload;
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  if (
    typeof signedPayload !== "string" ||
    signedPayload.length < 20 ||
    signedPayload.length > MAX_APPLE_SIGNED_PAYLOAD_LENGTH
  ) {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  try {
    const { notification, result } =
      await processAppleNotificationJws(signedPayload);
    console.info("[billing.apple.notification] processed", {
      notificationUUID: notification.notificationUUID,
      notificationType: notification.notificationType,
      environment: notification.environment.toLowerCase(),
      duplicate: result.duplicate,
    });
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const verificationError = error instanceof AppleVerificationError;
    console.error("[billing.apple.notification] failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      stage: verificationError ? "verification" : "processing",
    });
    return NextResponse.json(
      { received: false },
      { status: verificationError ? 400 : 500 }
    );
  }
}
