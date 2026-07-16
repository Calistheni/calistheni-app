import "dotenv/config";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const { Client } = pg;
const execFileAsync = promisify(execFile);

const CONFIRMATION = "REPAIR_L_SIT_EXERCISES";
const isApply = process.argv.includes("--apply");
const ORIGINAL_SLUG = "l-sit-hold";
const NEW_HOLD_SLUG = "floor-l-sit-hold";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getCanonicalExercises(assetsBaseUrl) {
  return {
    original: {
      id: ORIGINAL_SLUG,
      slug: ORIGINAL_SLUG,
      name: "L-Sit",
      muscle: "Abdominals",
      secondaryMuscles: ["Triceps", "Shoulders"],
      thumbnailUrl: `${assetsBaseUrl}/exercise-assets/${ORIGINAL_SLUG}/thumbnail.jpg`,
      videoUrl: `${assetsBaseUrl}/exercise-assets/${ORIGINAL_SLUG}/video.mp4`,
      trackingType: "DURATION",
      bodyweightLoadFactor: null,
    },
    hold: {
      id: NEW_HOLD_SLUG,
      slug: NEW_HOLD_SLUG,
      name: "L-Sit Hold",
      muscle: "Abdominals",
      secondaryMuscles: ["Quadriceps", "Triceps", "Shoulders"],
      thumbnailUrl: `${assetsBaseUrl}/exercise-assets/${NEW_HOLD_SLUG}/thumbnail.png`,
      videoUrl: null,
      trackingType: "DURATION",
      bodyweightLoadFactor: 0.3,
    },
  };
}

function isOverwrittenOriginal(record, original) {
  return (
    record.slug === NEW_HOLD_SLUG &&
    record.createdByUserId === null &&
    record.videoUrl === original.videoUrl
  );
}

async function assetExistsAtOrigin(url) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(
    `${url}${separator}verify-origin=${Date.now()}`,
    { method: "HEAD" }
  );

  return response.ok;
}

async function ensureOriginalThumbnail(original) {
  if (await assetExistsAtOrigin(original.thumbnailUrl)) {
    return "already present";
  }

  const imagePath = requiredEnvironment("ORIGINAL_L_SIT_THUMBNAIL_PATH");
  const extension = path.extname(imagePath).toLowerCase();

  if (extension !== ".jpg" && extension !== ".jpeg") {
    throw new Error("ORIGINAL_L_SIT_THUMBNAIL_PATH must be a JPEG image.");
  }

  await fs.access(imagePath);
  const bucketName =
    process.env.EXERCISE_R2_BUCKET_NAME?.trim() || "calistheni-assets";

  if (bucketName !== "calistheni-assets") {
    throw new Error(
      `Refusing to upload exercise media to unexpected bucket: ${bucketName}`
    );
  }

  await execFileAsync(
    process.env.WRANGLER_BIN?.trim() || "wrangler",
    [
      "r2",
      "object",
      "put",
      `${bucketName}/exercise-assets/${ORIGINAL_SLUG}/thumbnail.jpg`,
      "--file",
      imagePath,
      "--content-type",
      "image/jpeg",
      "--cache-control",
      "public, max-age=3600",
      "--remote",
    ],
    {
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: path.join(os.tmpdir(), "wrangler-calistheni.log"),
      },
    }
  );

  return "restored from the supplied original image";
}

async function readLSitRecords(client) {
  const result = await client.query(
    `
      SELECT e.id, e.slug, e.name, e.muscle, e."secondaryMuscles",
             e."thumbnailUrl", e."videoUrl", e."trackingType",
             e."bodyweightLoadFactor", e."createdByUserId", e."createdAt",
             e."updatedAt",
             (SELECT COUNT(*)::int FROM "WorkoutExercise" workout
              WHERE workout."exerciseId" = e.id) AS "workoutRelations",
             (SELECT COUNT(*)::int FROM "WorkoutTemplateExercise" template
              WHERE template."exerciseId" = e.id) AS "routineRelations",
             (SELECT COUNT(*)::int FROM "PersonalRecord" record
              WHERE record."exerciseId" = e.id) AS "personalRecordRelations"
      FROM "Exercise" e
      WHERE e.slug = ANY($1::text[])
      ORDER BY e.slug
    `,
    [[ORIGINAL_SLUG, NEW_HOLD_SLUG]]
  );

  return result.rows;
}

async function updateCanonicalExercise(client, exercise) {
  await client.query(
    `
      UPDATE "Exercise"
      SET name = $2,
          muscle = $3,
          "secondaryMuscles" = $4,
          "thumbnailUrl" = $5,
          "videoUrl" = $6,
          "trackingType" = $7::"ExerciseTrackingType",
          "bodyweightLoadFactor" = $8,
          "createdByUserId" = NULL,
          "updatedAt" = NOW()
      WHERE slug = $1
    `,
    [
      exercise.slug,
      exercise.name,
      exercise.muscle,
      exercise.secondaryMuscles,
      exercise.thumbnailUrl,
      exercise.videoUrl,
      exercise.trackingType,
      exercise.bodyweightLoadFactor,
    ]
  );
}

async function insertCanonicalExercise(client, exercise) {
  await client.query(
    `
      INSERT INTO "Exercise" (
        id, slug, name, muscle, "secondaryMuscles", "thumbnailUrl",
        "videoUrl", "trackingType", "bodyweightLoadFactor",
        "createdByUserId", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::"ExerciseTrackingType", $9, NULL, NOW()
      )
    `,
    [
      exercise.id,
      exercise.slug,
      exercise.name,
      exercise.muscle,
      exercise.secondaryMuscles,
      exercise.thumbnailUrl,
      exercise.videoUrl,
      exercise.trackingType,
      exercise.bodyweightLoadFactor,
    ]
  );
}

async function main() {
  if (isApply && process.env.CONFIRM_REPAIR_L_SIT_EXERCISES !== CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_REPAIR_L_SIT_EXERCISES=${CONFIRMATION} to apply changes.`
    );
  }

  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const assetsBaseUrl = requiredEnvironment("NEXT_PUBLIC_ASSETS_URL").replace(
    /\/+$/,
    ""
  );
  const exercises = getCanonicalExercises(assetsBaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const before = await readLSitRecords(client);
    const originalRecord = before.find(
      (record) => record.slug === ORIGINAL_SLUG
    );
    const holdRecord = before.find((record) => record.slug === NEW_HOLD_SLUG);
    const shouldRestoreOverwrittenRecord =
      !originalRecord &&
      holdRecord &&
      isOverwrittenOriginal(holdRecord, exercises.original);

    if (!originalRecord && holdRecord && !shouldRestoreOverwrittenRecord) {
      throw new Error(
        `${NEW_HOLD_SLUG} does not match the overwritten original fingerprint. Refusing an ambiguous repair.`
      );
    }

    console.log(
      JSON.stringify(
        {
          mode: isApply ? "apply" : "dry-run",
          before,
          plan: {
            original: shouldRestoreOverwrittenRecord
              ? "restore overwritten record and preserve its relations"
              : originalRecord
                ? "normalize existing record"
                : "create missing record",
            hold: holdRecord && !shouldRestoreOverwrittenRecord
              ? "normalize existing record"
              : "create separate record",
          },
        },
        null,
        2
      )
    );

    if (!isApply) {
      console.log(
        "No changes made. Re-run with --apply and the confirmation environment variable."
      );
      return;
    }

    const thumbnailStatus = await ensureOriginalThumbnail(exercises.original);

    await client.query("BEGIN");

    try {
      if (shouldRestoreOverwrittenRecord) {
        await client.query(
          `
            UPDATE "Exercise"
            SET id = $1, slug = $1, "updatedAt" = NOW()
            WHERE id = $2 AND slug = $2
          `,
          [ORIGINAL_SLUG, NEW_HOLD_SLUG]
        );
      }

      const recordsAfterRestore = await readLSitRecords(client);

      if (
        recordsAfterRestore.some((record) => record.slug === ORIGINAL_SLUG)
      ) {
        await updateCanonicalExercise(client, exercises.original);
      } else {
        await insertCanonicalExercise(client, exercises.original);
      }

      if (
        recordsAfterRestore.some((record) => record.slug === NEW_HOLD_SLUG)
      ) {
        await updateCanonicalExercise(client, exercises.hold);
      } else {
        await insertCanonicalExercise(client, exercises.hold);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          thumbnail: thumbnailStatus,
          restoredExistingRecord: Boolean(shouldRestoreOverwrittenRecord),
          after: await readLSitRecords(client),
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
