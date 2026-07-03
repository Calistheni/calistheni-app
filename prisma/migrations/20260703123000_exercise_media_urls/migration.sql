-- Move Exercise media from generated path/source columns to final public R2 URLs.
ALTER TABLE "Exercise"
ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT,
ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;

UPDATE "Exercise"
SET
  "thumbnailUrl" = COALESCE("thumbnailUrl", "thumbnailPath"),
  "videoUrl" = COALESCE("videoUrl", "videoPath");

ALTER TABLE "Exercise"
DROP COLUMN IF EXISTS "thumbnailPath",
DROP COLUMN IF EXISTS "videoPath",
DROP COLUMN IF EXISTS "sourceThumbnailUrl",
DROP COLUMN IF EXISTS "sourceVideoUrl";
