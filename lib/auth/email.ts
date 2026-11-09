import "server-only";

import { after } from "next/server";
import { processAuthEmailOutboxBatch } from "@/lib/auth/email-outbox";

export { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/auth/email-provider";

/** Request-time fast path. The same database lease used by the cron worker
 * prevents this path and scheduled retries from sending the same row together. */
export async function deliverQueuedAuthEmail(deliveryId: string) {
  return processAuthEmailOutboxBatch({ limit: 1, deliveryId });
}

export function scheduleAuthEmailDelivery(deliveryId: string) {
  after(async () => {
    await deliverQueuedAuthEmail(deliveryId);
    // Retain the existing small opportunistic drain, but all rows are claimed
    // through the same durable lease mechanism as the independent cron worker.
    await processAuthEmailOutboxBatch({ limit: 4 });
  });
}
