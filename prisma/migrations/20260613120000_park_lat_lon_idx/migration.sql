DROP INDEX IF EXISTS "Park_lat_idx";
DROP INDEX IF EXISTS "Park_lon_idx";

CREATE INDEX IF NOT EXISTS "park_lat_lon_idx"
ON "Park" ("lat", "lon");
