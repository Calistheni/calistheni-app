import "dotenv/config";
import pg from "pg";

const REVIEWED_MAPPINGS = {
  "pull-up": { primary: "Lats", secondary: ["Biceps", "Upper Back", "Forearms"] },
  "pull up": { primary: "Lats", secondary: ["Biceps", "Upper Back", "Forearms"] },
  "chin-up": { primary: "Lats", secondary: ["Biceps", "Upper Back", "Forearms"] },
  "chin up": { primary: "Lats", secondary: ["Biceps", "Upper Back", "Forearms"] },
  "push-up": { primary: "Chest", secondary: ["Triceps", "Shoulders", "Abdominals"] },
  "push up": { primary: "Chest", secondary: ["Triceps", "Shoulders", "Abdominals"] },
  "chest dip": { primary: "Chest", secondary: ["Triceps", "Shoulders"] },
  "triceps dip": { primary: "Triceps", secondary: ["Chest", "Shoulders"] },
  lunge: { primary: "Quadriceps", secondary: ["Glutes", "Hamstrings", "Calves"] },
  lunges: { primary: "Quadriceps", secondary: ["Glutes", "Hamstrings", "Calves"] },
  "bulgarian split squat": {
    primary: "Quadriceps",
    secondary: ["Glutes", "Hamstrings", "Calves"],
  },
  squat: { primary: "Quadriceps", secondary: ["Glutes", "Hamstrings", "Abdominals"] },
  "muscle-up": {
    primary: "Lats",
    secondary: ["Biceps", "Chest", "Triceps", "Shoulders", "Abdominals"],
  },
  "muscle up": {
    primary: "Lats",
    secondary: ["Biceps", "Chest", "Triceps", "Shoulders", "Abdominals"],
  },
  "inverted row": {
    primary: "Upper Back",
    secondary: ["Lats", "Biceps", "Shoulders", "Forearms"],
  },
  "handstand push-up": {
    primary: "Shoulders",
    secondary: ["Triceps", "Chest", "Abdominals"],
  },
  "handstand push up": {
    primary: "Shoulders",
    secondary: ["Triceps", "Chest", "Abdominals"],
  },
  "pike push-up": {
    primary: "Shoulders",
    secondary: ["Triceps", "Chest", "Abdominals"],
  },
  "pike push up": {
    primary: "Shoulders",
    secondary: ["Triceps", "Chest", "Abdominals"],
  },
  plank: {
    primary: "Abdominals",
    secondary: ["Lower Back", "Shoulders", "Glutes"],
  },
  "l-sit": {
    primary: "Abdominals",
    secondary: ["Triceps", "Quadriceps"],
  },
  "l sit": {
    primary: "Abdominals",
    secondary: ["Triceps", "Quadriceps"],
  },
  "dead hang": {
    primary: "Forearms",
    secondary: ["Lats", "Shoulders", "Upper Back"],
  },
  "calf raise": { primary: "Calves", secondary: [] },
  "hip thrust": {
    primary: "Glutes",
    secondary: ["Hamstrings", "Quadriceps", "Abdominals"],
  },
  "glute bridge": {
    primary: "Glutes",
    secondary: ["Hamstrings", "Abdominals"],
  },
};

const normalizeName = (value) =>
  value.toLowerCase().trim().replace(/\s+/g, " ");
const apply = process.argv.includes("--apply");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const result = await client.query(
    'SELECT id, name, muscle, "secondaryMuscles" FROM "Exercise" WHERE "createdByUserId" IS NULL ORDER BY name'
  );
  const matchedMappingNames = new Set();
  const updates = [];
  const conflicts = [];

  for (const exercise of result.rows) {
    const key = normalizeName(exercise.name);
    const mapping = REVIEWED_MAPPINGS[key];
    if (!mapping) continue;
    matchedMappingNames.add(key);

    if (exercise.muscle !== mapping.primary) {
      conflicts.push({
        id: exercise.id,
        name: exercise.name,
        existingPrimary: exercise.muscle,
        reviewedPrimary: mapping.primary,
      });
      continue;
    }

    const secondary = [...new Set(mapping.secondary)].filter(
      (muscle) => muscle !== exercise.muscle
    );
    if (
      JSON.stringify([...exercise.secondaryMuscles].sort()) !==
      JSON.stringify([...secondary].sort())
    ) {
      updates.push({ ...exercise, secondary });
    }
  }

  const unknownMappings = Object.keys(REVIEWED_MAPPINGS).filter(
    (name) => !matchedMappingNames.has(name)
  );
  const exercisesWithoutReviewedMapping = result.rows
    .filter((exercise) => !REVIEWED_MAPPINGS[normalizeName(exercise.name)])
    .map((exercise) => exercise.name);
  const report = {
    mode: apply ? "apply" : "dry-run",
    exercisesScanned: result.rows.length,
    exercisesMatched: matchedMappingNames.size,
    exercisesUpdated: updates.length,
    relationshipsCreated: updates.reduce(
      (sum, exercise) => sum + exercise.secondary.length,
      0
    ),
    conflicts,
    unknownMappings,
    exercisesWithoutReviewedMapping,
  };

  if (apply) {
    await client.query("BEGIN");
    try {
      for (const exercise of updates) {
        await client.query(
          'UPDATE "Exercise" SET "secondaryMuscles" = $1, "updatedAt" = NOW() WHERE id = $2',
          [exercise.secondary, exercise.id]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}
