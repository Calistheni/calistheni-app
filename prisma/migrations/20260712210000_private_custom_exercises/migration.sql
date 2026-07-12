ALTER TABLE "Exercise"
ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Exercise_createdByUserId_idx"
ON "Exercise"("createdByUserId");

ALTER TABLE "Exercise"
ADD CONSTRAINT "Exercise_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
