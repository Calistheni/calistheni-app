export type PhotoReferenceCounts = {
  photo_rows: string;
  active_owner_photo_rows: string;
  soft_deleted_owner_photo_rows: string;
  missing_owner_photo_rows: string;
  invalid_key_photo_rows: string;
  open_account_deletion_photo_rows: string;
  open_workout_media_jobs: string;
  pending_workout_keys: string;
  pending_only_keys: string;
};

export const PHOTO_REFERENCE_COUNTS_SQL = `
WITH photos AS (
  SELECT photo."storageKey" AS key,
         (photo_owner."deletedAt" IS NOT NULL OR workout_owner."deletedAt" IS NOT NULL) AS soft_deleted_owner,
         (photo_owner.id IS NULL OR workout_owner.id IS NULL) AS missing_owner,
         EXISTS (
           SELECT 1
           FROM public."AccountDeletion" AS deletion
           WHERE deletion."status" <> 'CLEANUP_COMPLETED'
             AND deletion."userId" IN (photo."userId", workout."userId")
         ) AS open_account_deletion
  FROM public."WorkoutPhoto" AS photo
  LEFT JOIN public."Workout" AS workout ON workout.id = photo."workoutId"
  LEFT JOIN public."User" AS photo_owner ON photo_owner.id = photo."userId"
  LEFT JOIN public."User" AS workout_owner ON workout_owner.id = workout."userId"
), pending AS (
  SELECT "resourceId" AS key
  FROM public."DeletionCommunityReviewTask"
  WHERE "resourceKind" = 'MEDIA'
    AND "status" IN ('PENDING', 'PROCESSING', 'RETRY')
    AND "resourceId" ~* '^users/[a-z0-9_-]+/workouts/[0-9]+/[a-f0-9-]+[.]webp$'
)
SELECT
  count(*) AS photo_rows,
  count(*) FILTER (WHERE NOT missing_owner AND NOT soft_deleted_owner) AS active_owner_photo_rows,
  count(*) FILTER (WHERE soft_deleted_owner) AS soft_deleted_owner_photo_rows,
  count(*) FILTER (WHERE missing_owner) AS missing_owner_photo_rows,
  count(*) FILTER (WHERE key !~* '^users/[a-z0-9_-]+/workouts/[0-9]+/[a-f0-9-]+[.]webp$') AS invalid_key_photo_rows,
  count(*) FILTER (WHERE open_account_deletion) AS open_account_deletion_photo_rows,
  (SELECT count(*) FROM pending) AS open_workout_media_jobs,
  (SELECT count(DISTINCT key) FROM pending) AS pending_workout_keys,
  (SELECT count(DISTINCT pending.key) FROM pending
   WHERE NOT EXISTS (SELECT 1 FROM photos WHERE photos.key = pending.key)) AS pending_only_keys
FROM photos;
`;
