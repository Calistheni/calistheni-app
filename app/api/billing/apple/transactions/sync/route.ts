import { NextResponse } from "next/server";
import { AppleTransactionOwnershipError } from "@/lib/apple-iap/ownership";
import {
  AppleTransactionSyncInputError,
  parseAppleTransactionSyncInput,
  synchronizeAppleTransactionJwsBatch,
} from "@/lib/apple-iap/sync";
import { AppleVerificationError } from "@/lib/apple-iap/verification";
import { getUserEntitlements } from "@/lib/entitlements";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  try {
    const body = await request.json();
    const signedTransactions = parseAppleTransactionSyncInput(body);
    const synchronized = await synchronizeAppleTransactionJwsBatch({
      userId,
      signedTransactions,
    });
    const { entitlements } = await getUserEntitlements(userId);

    console.info("[billing.apple.sync] completed", {
      userId,
      transactionCount: synchronized.transactions.length,
      environments: [
        ...new Set(
          synchronized.transactions.map((transaction) =>
            transaction.environment.toLowerCase()
          )
        ),
      ],
      isPro: entitlements.isPro,
    });
    return NextResponse.json({
      accepted: synchronized.transactions.length,
      isPro: entitlements.isPro,
    });
  } catch (error) {
    const inputError =
      error instanceof SyntaxError ||
      error instanceof AppleTransactionSyncInputError;
    const ownershipError = error instanceof AppleTransactionOwnershipError;
    const verificationError = error instanceof AppleVerificationError;
    console.error("[billing.apple.sync] failed", {
      userId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      {
        code: inputError
          ? "APPLE_SYNC_INVALID_REQUEST"
          : ownershipError
            ? "APPLE_TRANSACTION_OWNERSHIP_MISMATCH"
            : verificationError
              ? "APPLE_TRANSACTION_VERIFICATION_FAILED"
              : "APPLE_TRANSACTION_SYNC_FAILED",
        error:
          inputError
            ? "Invalid Apple transaction sync request."
            : ownershipError
              ? "This Apple purchase belongs to another Calistheni account."
              : "Apple purchase verification is unavailable right now.",
      },
      {
        status: inputError
          ? 400
          : ownershipError
            ? 409
            : verificationError
              ? 400
              : 500,
      }
    );
  }
}
