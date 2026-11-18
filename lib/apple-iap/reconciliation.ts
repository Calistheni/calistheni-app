import "server-only";

import {
  getAuthoritativeAppleTransactionStateWithBoundary,
  type AppleAuthoritativeTransactionState,
  type AppleServerApiBoundary,
} from "@/lib/apple-iap/reconciliation-core";
import { getAppleServerApiClient } from "@/lib/apple-iap/server-api";
import {
  verifyAppleRenewalInfo,
  verifyAppleTransaction,
} from "@/lib/apple-iap/verification";
import type { AppleVerifiedTransaction } from "@/lib/apple-iap/verification-types";

export type { AppleAuthoritativeTransactionState, AppleServerApiBoundary };

export async function getAuthoritativeAppleTransactionState(
  submitted: AppleVerifiedTransaction
): Promise<AppleAuthoritativeTransactionState> {
  return getAuthoritativeAppleTransactionStateWithBoundary(submitted, {
    client: getAppleServerApiClient(submitted.environment),
    verifyTransaction: (value, environment) =>
      verifyAppleTransaction(value, { expectedEnvironment: environment }),
    verifyRenewalInfo: (value, environment) =>
      verifyAppleRenewalInfo(value, environment),
  });
}
