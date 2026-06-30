-- Restore the migration that is already reflected in the development database.
CREATE SEQUENCE IF NOT EXISTS "Park_id_seq";

SELECT setval(
  '"Park_id_seq"',
  COALESCE((SELECT MAX("id") FROM "Park"), 1),
  (SELECT MAX("id") IS NOT NULL FROM "Park")
);

ALTER TABLE "Park"
ALTER COLUMN "id" SET DEFAULT nextval('"Park_id_seq"');

ALTER SEQUENCE "Park_id_seq" OWNED BY "Park"."id";

ALTER TABLE "Park"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "park_lat_lon_idx"
ON "Park" ("lat", "lon");
