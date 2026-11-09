import { NextResponse } from "next/server";
import {
  getAuthEmailBatchLimit,
  getAuthEmailOutboxStatus,
  authEmailWorkerAuthorized,
  processAuthEmailOutboxBatch,
} from "@/lib/auth/email-outbox";
import { isAuthEmailWorkerEnabled } from "@/lib/auth/email-outbox-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authEmailWorkerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!isAuthEmailWorkerEnabled()) {
    return NextResponse.json({ error: "Email worker is disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await processAuthEmailOutboxBatch({ limit: getAuthEmailBatchLimit() });
    const status = await getAuthEmailOutboxStatus();
    if (status.health !== "HEALTHY") {
      // Aggregate-only operational signal; never log recipients, action tokens,
      // provider bodies, or database row identifiers.
      console.warn("[auth-email] outbox health requires attention", {
        health: status.health,
        pending: status.pending,
        permanentlyFailed: status.permanentlyFailed,
        expiredLeases: status.expiredLeases,
        oldestPendingAgeSeconds: status.oldestPendingAgeSeconds,
      });
    }
    return NextResponse.json({ ...result, ...status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never put recipient addresses, action tokens, database errors, or secrets
    // into function logs or the monitoring response.
    console.error("[auth-email] outbox worker invocation failed");
    return NextResponse.json({ error: "Email worker failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
