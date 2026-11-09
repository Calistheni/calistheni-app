-- Supports the account-deletion worker's indexed batch lookup of park photo keys.
CREATE INDEX "Park_photoKey_idx" ON "Park"("photoKey");
