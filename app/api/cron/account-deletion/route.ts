import { NextResponse } from "next/server";
import {
  accountDeletionWorkerAuthorized,
  processAccountDeletionBatch,
} from "@/lib/account-deletion-worker";
import { getAccountDeletionBatchLimit, isAccountDeletionWorkerEnabled } from "@/lib/account-deletion-config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!accountDeletionWorkerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!isAccountDeletionWorkerEnabled()) {
    return NextResponse.json({ error: "Cleanup worker is disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await processAccountDeletionBatch({ limit: getAccountDeletionBatchLimit(process.env.ACCOUNT_DELETION_BATCH_LIMIT) });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Keep database and provider details out of cron response bodies.
    console.error("[account-deletion] worker invocation failed");
    return NextResponse.json({ error: "Cleanup worker failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
