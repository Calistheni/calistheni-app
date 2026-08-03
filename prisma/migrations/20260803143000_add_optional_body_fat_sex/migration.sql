-- Additive and optional: existing users remain unset until they explicitly choose a formula.
CREATE TYPE "BodyFatSex" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "User" ADD COLUMN "bodyFatSex" "BodyFatSex";
