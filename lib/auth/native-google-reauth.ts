import "server-only";

import { prisma } from "@/lib/prisma";
import { hashNativeAuthSecret, NATIVE_AUTH_HANDOFF_TTL_MS } from "./native-auth-server";

/** Issue reauthentication only from an OAuth callback with a verified Google subject. */
export async function issueNativeGoogleReauthentication(
  attemptId: string,
  nonce: string,
  providerAccountId: string,
) {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId } },
    select: { userId: true },
  });
  if (!account) return false;

  const now = new Date();
  const issued = await prisma.nativeAuthAttempt.updateMany({
    where: {
      id: attemptId,
      intent: "REAUTH",
      userId: account.userId,
      user: { is: { deletedAt: null } },
      nonceHash: hashNativeAuthSecret(nonce),
      verifierChallenge: { not: null },
      initiatingSessionHash: { not: null },
      browserStartedAt: { not: null },
      expiresAt: { gt: now },
      consumedAt: null,
      handoffIssuedAt: null,
    },
    data: { handoffIssuedAt: now, expiresAt: new Date(now.getTime() + NATIVE_AUTH_HANDOFF_TTL_MS) },
  });
  return issued.count === 1;
}
