import "dotenv/config";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { findExerciseByCanonicalSlug } from "../lib/exercise-import-identity.mjs";

const { Client } = pg;
const execFileAsync = promisify(execFile);

const CONFIRMATION = "ADD_EXERCISES";
const isApply = process.argv.includes("--apply");

const exercises = [
  {
    slug: "floor-l-sit-hold",
    name: "L-Sit Hold",
    muscle: "Abdominals",
    secondaryMuscles: ["Quadriceps", "Triceps", "Shoulders"],
    trackingType: "DURATION",
    bodyweightLoadFactor: 0.3,
    imagePath:
      process.env.FLOOR_L_SIT_HOLD_IMAGE_PATH ??
      process.env.L_SIT_HOLD_IMAGE_PATH,
    imageFileName: "thumbnail.png",
    contentType: "image/png",
    obsoleteKeys: ["exercise-assets/floor-l-sit-hold/thumbnail.jpg"],
  },
  {
    slug: "ring-muscle-up",
    name: "Ring Muscle-Up",
    muscle: "Lats",
    secondaryMuscles: [
      "Biceps",
      "Chest",
      "Triceps",
      "Shoulders",
      "Abdominals",
    ],
    trackingType: "BODYWEIGHT_REPS",
    bodyweightLoadFactor: 2,
    imagePath: process.env.RING_MUSCLE_UP_IMAGE_PATH,
    imageFileName: "thumbnail.png",
    contentType: "image/png",
    obsoleteKeys: ["exercise-assets/ring-muscle-up/thumbnail.jpg"],
  },
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function loadImage(imagePath, exerciseName, expectedExtension) {
  if (!imagePath) {
    throw new Error(`An image path is required for ${exerciseName}.`);
  }

  const extension = path.extname(imagePath).toLowerCase();
  const validExtensions =
    expectedExtension === ".jpg" ? [".jpg", ".jpeg"] : [expectedExtension];

  if (!validExtensions.includes(extension)) {
    throw new Error(
      `${exerciseName} must use the supplied ${expectedExtension} image.`
    );
  }

  return fs.readFile(imagePath);
}

async function main() {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const bucketName =
    process.env.EXERCISE_R2_BUCKET_NAME?.trim() || "calistheni-assets";
  const assetsBaseUrl = requiredEnvironment("NEXT_PUBLIC_ASSETS_URL").replace(
    /\/+$/,
    ""
  );

  if (bucketName !== "calistheni-assets") {
    throw new Error(
      `Refusing to upload exercise media to unexpected bucket: ${bucketName}`
    );
  }

  if (isApply && process.env.CONFIRM_ADD_L_SIT_AND_RING_MUSCLE_UP !== CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_ADD_L_SIT_AND_RING_MUSCLE_UP=${CONFIRMATION} to apply changes.`
    );
  }

  for (const exercise of exercises) {
    await loadImage(
      exercise.imagePath,
      exercise.name,
      path.extname(exercise.imageFileName)
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const existingResult = await client.query(
      `
        SELECT id, slug, name, muscle, "secondaryMuscles", "thumbnailUrl",
               "videoUrl", "trackingType", "bodyweightLoadFactor"
        FROM "Exercise"
        WHERE "createdByUserId" IS NULL
      `
    );

    for (const exercise of exercises) {
      const exact = findExerciseByCanonicalSlug(
        existingResult.rows,
        exercise.slug
      );

      console.log(
        `${isApply ? "Apply" : "Dry run"}: ${
          exact ? "update" : "create"
        } ${exercise.name} at exercise-assets/${exercise.slug}/${
          exercise.imageFileName
        }`
      );
    }

    if (!isApply) {
      console.log(
        "No changes made. Re-run with --apply and the confirmation environment variable."
      );
      return;
    }

    for (const exercise of exercises) {
      await execFileAsync(
        process.env.WRANGLER_BIN?.trim() || "wrangler",
        [
          "r2",
          "object",
          "put",
          `${bucketName}/exercise-assets/${exercise.slug}/${exercise.imageFileName}`,
          "--file",
          exercise.imagePath,
          "--content-type",
          exercise.contentType,
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
    }

    await client.query("BEGIN");

    try {
      for (const exercise of exercises) {
        const thumbnailUrl = `${assetsBaseUrl}/exercise-assets/${exercise.slug}/${exercise.imageFileName}`;

        await client.query(
          `
            INSERT INTO "Exercise" (
              id, slug, name, muscle, "secondaryMuscles", "thumbnailUrl",
              "videoUrl", "trackingType", "bodyweightLoadFactor", "updatedAt"
            )
            VALUES ($1, $1, $2, $3, $4, $5, NULL, $6::"ExerciseTrackingType", $7, NOW())
            ON CONFLICT (slug) DO UPDATE SET
              name = EXCLUDED.name,
              muscle = EXCLUDED.muscle,
              "secondaryMuscles" = EXCLUDED."secondaryMuscles",
              "thumbnailUrl" = EXCLUDED."thumbnailUrl",
              "trackingType" = EXCLUDED."trackingType",
              "bodyweightLoadFactor" = EXCLUDED."bodyweightLoadFactor",
              "createdByUserId" = NULL,
              "updatedAt" = NOW()
          `,
          [
            exercise.slug,
            exercise.name,
            exercise.muscle,
            exercise.secondaryMuscles,
            thumbnailUrl,
            exercise.trackingType,
            exercise.bodyweightLoadFactor,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    for (const exercise of exercises) {
      for (const obsoleteKey of exercise.obsoleteKeys) {
        await execFileAsync(
          process.env.WRANGLER_BIN?.trim() || "wrangler",
          ["r2", "object", "delete", `${bucketName}/${obsoleteKey}`, "--remote"],
          {
            env: {
              ...process.env,
              WRANGLER_LOG_PATH: path.join(
                os.tmpdir(),
                "wrangler-calistheni.log"
              ),
            },
          }
        );
      }
    }

    console.log("Uploaded media and upserted 2 production exercises.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
