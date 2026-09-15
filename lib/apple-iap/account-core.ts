import { randomUUID } from "node:crypto";

export type AppleBillingAccountSnapshot = {
  userId: string;
  appAccountToken: string;
};

export async function resolveStableAppleBillingAccount({
  userId,
  findByUserId,
  create,
  createToken = randomUUID,
}: {
  userId: string;
  findByUserId: (
    userId: string
  ) => Promise<AppleBillingAccountSnapshot | null>;
  create: (
    userId: string,
    appAccountToken: string
  ) => Promise<AppleBillingAccountSnapshot>;
  createToken?: () => string;
}) {
  const existing = await findByUserId(userId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await create(userId, createToken());
    } catch (error) {
      const concurrent = await findByUserId(userId);
      if (concurrent) return concurrent;
      if (attempt === 2) throw error;
    }
  }

  throw new Error("Unable to create Apple billing account.");
}
