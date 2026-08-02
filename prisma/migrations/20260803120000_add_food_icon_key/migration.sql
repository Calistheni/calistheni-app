-- A curator may pin a generic public-food-icon key without replacing provider
-- product imagery. Automatic icon resolution remains runtime-derived.
ALTER TABLE "Food" ADD COLUMN "iconKey" TEXT;
