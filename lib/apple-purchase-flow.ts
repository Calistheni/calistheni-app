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
