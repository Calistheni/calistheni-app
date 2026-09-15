import type { AppleVerifiedNotification } from "@/lib/apple-iap/verification-types";

export type AppleNotificationAction =
  | "IGNORE_TEST"
  | "SYNC_TRANSACTION"
  | "SYNC_RENEWAL"
  | "AUDIT_ONLY";

export function getAppleNotificationAction(
  notification: Pick<
    AppleVerifiedNotification,
    "notificationType" | "transaction" | "renewalInfo"
  >
): AppleNotificationAction {
  if (notification.notificationType === "TEST") return "IGNORE_TEST";
  if (notification.transaction) return "SYNC_TRANSACTION";
  if (notification.renewalInfo) return "SYNC_RENEWAL";
  return "AUDIT_ONLY";
}
