export type AppleTransactionForSync = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  environment: string;
  signedTransaction: string;
};

export async function acknowledgeThenFinishAppleTransaction({
  transaction,
  synchronize,
  finish,
}: {
  transaction: AppleTransactionForSync;
  synchronize: (signedTransaction: string) => Promise<{ isPro: boolean }>;
  finish: (transactionId: string) => Promise<void>;
}) {
  const acknowledgement = await synchronize(transaction.signedTransaction);
  await finish(transaction.transactionId);
  return acknowledgement;
}

export function createAppleBackgroundTransactionSync(
  isOwnershipMismatch: (error: unknown) => boolean,
  now = Date.now
) {
  const retryAfter = new Map<string, number>();

  return async (
    transaction: Pick<AppleTransactionForSync, "environment" | "transactionId">,
    synchronize: () => Promise<{ isPro: boolean }>
  ) => {
    const key = `${transaction.environment}:${transaction.transactionId}`;
    const time = now();
    for (const [blockedKey, deadline] of retryAfter) {
      if (deadline <= time) retryAfter.delete(blockedKey);
    }
    if (retryAfter.has(key)) return null;

    try {
      return await synchronize();
    } catch (error) {
      if (isOwnershipMismatch(error)) retryAfter.set(key, now() + 60_000);
      throw error;
    }
  };
}
