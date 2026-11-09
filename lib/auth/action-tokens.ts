import "server-only";

import type { AuthActionTokenPurpose } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuthSecret, encryptAuthToken, hashAuthSecret } from "@/lib/auth/security";

const TOKEN_TTL_MS: Record<AuthActionTokenPurpose, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

export async function createAuthActionToken({
  userId,
  emailNormalized,
  purpose,
  now = new Date(),
}: {
  userId: string;
  emailNormalized: string;
  purpose: AuthActionTokenPurpose;
  now?: Date;
}) {
  const token = createAuthSecret();
  const encrypted = encryptAuthToken(token);
  let deliveryId = "";
  await prisma.$transaction(async (tx) => {
    const activeUser = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!activeUser.length) throw new Error("AUTH_USER_DEACTIVATED");
    await tx.authActionToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: now },
    });
    const actionToken = await tx.authActionToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashAuthSecret(token),
        emailNormalized,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
      },
    });
    const delivery = await tx.authEmailDelivery.create({
      data: {
        actionTokenId: actionToken.id,
        purpose,
        emailNormalized,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        encryptionKeyId: encrypted.keyId,
      },
      select: { id: true },
    });
    deliveryId = delivery.id;
  });
  return { token, deliveryId };
}

export async function findUsableAuthActionToken(
  token: string,
  purpose: AuthActionTokenPurpose,
  now = new Date()
) {
  return prisma.authActionToken.findFirst({
    where: {
      tokenHash: hashAuthSecret(token),
      purpose,
      consumedAt: null,
      expiresAt: { gt: now },
    },
  });
}
