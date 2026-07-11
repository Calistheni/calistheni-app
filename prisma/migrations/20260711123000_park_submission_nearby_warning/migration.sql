ALTER TABLE "Park" ADD COLUMN "nearbyParkWarning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Park" ADD COLUMN "closestNearbyParkId" INTEGER;
ALTER TABLE "Park" ADD COLUMN "closestNearbyParkDistanceMeters" DOUBLE PRECISION;
