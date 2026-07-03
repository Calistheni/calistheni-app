import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createExerciseSlug } from "../lib/exercise-slug.mjs";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exerciseJsonPath = path.join(__dirname, "..", "data", "exercises.json");

function getAssetsBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_ASSETS_URL ?? "https://assets.calistheni.app"
  ).replace(/\/+$/, "");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed exercises.");
  }

  const assetsBaseUrl = getAssetsBaseUrl();
  const rawExercises = JSON.parse(await fs.readFile(exerciseJsonPath, "utf8"));
  const seenSlugs = new Map();
  const exercises = rawExercises.map((exercise) => {
    const baseSlug = createExerciseSlug(exercise.name);
    const count = seenSlugs.get(baseSlug) ?? 0;
    seenSlugs.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

    return {
      id: slug,
      slug,
      name: exercise.name,
      muscle: exercise.muscle,
      thumbnailUrl: `${assetsBaseUrl}/exercise-assets/${slug}/thumbnail.jpg`,
      videoUrl: exercise.videoUrl
        ? `${assetsBaseUrl}/exercise-assets/${slug}/video.mp4`
        : null,
    };
  });

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const exercise of exercises) {
      await client.query(
        `
          INSERT INTO "Exercise" (
            "id",
            "slug",
            "name",
            "muscle",
            "thumbnailUrl",
            "videoUrl",
            "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT ("slug") DO UPDATE SET
            "id" = EXCLUDED."id",
            "name" = EXCLUDED."name",
            "muscle" = EXCLUDED."muscle",
            "thumbnailUrl" = EXCLUDED."thumbnailUrl",
            "videoUrl" = EXCLUDED."videoUrl",
            "updatedAt" = NOW()
        `,
        [
          exercise.id,
          exercise.slug,
          exercise.name,
          exercise.muscle,
          exercise.thumbnailUrl,
          exercise.videoUrl,
        ]
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${exercises.length} exercises.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
