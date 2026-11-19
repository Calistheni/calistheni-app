ALTER TYPE "NativeAuthIntent" ADD VALUE 'REAUTH';
ALTER TYPE "NativeAuthIntent" ADD VALUE 'BEARER_LOGIN';
ALTER TABLE "NativeAuthAttempt"
  ADD COLUMN "verifierChallenge" TEXT,
  ADD COLUMN "initiatingSessionHash" TEXT;
