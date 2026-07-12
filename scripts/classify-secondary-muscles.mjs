import "dotenv/config";
import pg from "pg";

const VALID_MUSCLES = new Set([
  "Abdominals", "Abductors", "Adductors", "Biceps", "Calves", "Cardio",
  "Chest", "Forearms", "Full Body", "Glutes", "Hamstrings", "Lats",
  "Lower Back", "Neck", "Quadriceps", "Shoulders", "Traps", "Triceps",
  "Upper Back",
]);

function unique(primary, muscles) {
  return [...new Set(muscles)].filter(
    (muscle) => muscle !== primary && VALID_MUSCLES.has(muscle)
  );
}

function classify(name, primary) {
  const n = name.toLowerCase();
  const has = (...patterns) => patterns.some((pattern) => n.includes(pattern));
  let secondary = [];

  if (primary === "Chest") {
    if (has("fly", "crossover", "around the world")) secondary = ["Shoulders"];
    else if (has("dip")) secondary = ["Triceps", "Shoulders"];
    else secondary = ["Triceps", "Shoulders"];
  } else if (primary === "Lats") {
    if (has("pullover", "straight arm")) secondary = ["Chest", "Triceps"];
    else if (has("row")) secondary = ["Upper Back", "Biceps", "Forearms"];
    else secondary = ["Biceps", "Upper Back", "Forearms"];
  } else if (primary === "Upper Back") {
    if (has("dead hang")) secondary = ["Forearms", "Lats", "Shoulders"];
    else if (has("rack pull")) secondary = ["Traps", "Lower Back", "Glutes", "Hamstrings"];
    else if (has("scapular")) secondary = ["Lats", "Traps", "Shoulders"];
    else if (has("renegade")) secondary = ["Lats", "Biceps", "Abdominals", "Shoulders"];
    else secondary = ["Lats", "Biceps", "Forearms"];
  } else if (primary === "Shoulders") {
    if (has("reverse fly", "face pull", "pullapart", "y raise")) secondary = ["Upper Back", "Traps"];
    else if (has("upright row")) secondary = ["Traps", "Biceps", "Forearms"];
    else if (has("press", "push up", "pushup", "pike")) secondary = ["Triceps", "Chest"];
    else if (has("shoulder taps")) secondary = ["Abdominals", "Chest", "Triceps"];
    else if (has("halo", "around the world")) secondary = ["Traps", "Abdominals"];
    else if (has("raise")) secondary = ["Traps"];
  } else if (primary === "Triceps") {
    if (has("dip", "bench press", "push up", "press (barbell)", "jm press")) secondary = ["Chest", "Shoulders"];
  } else if (primary === "Biceps") {
    if (has("hammer", "reverse", "zottman", "pinwheel", "rope", "plate", "waiter")) secondary = ["Forearms"];
    else if (has("suspension")) secondary = ["Forearms", "Abdominals"];
    else secondary = ["Forearms"];
  } else if (primary === "Quadriceps") {
    if (has("leg extension")) secondary = [];
    else if (has("sumo")) secondary = ["Glutes", "Adductors", "Hamstrings"];
    else if (has("lateral lunge", "lateral squat", "curtsy")) secondary = ["Glutes", "Abductors", "Adductors"];
    else if (has("jump", "box jump")) secondary = ["Glutes", "Hamstrings", "Calves"];
    else if (has("lunge", "split squat", "step up", "pistol")) secondary = ["Glutes", "Hamstrings", "Calves"];
    else if (has("leg press", "squat", "wall sit")) secondary = ["Glutes", "Hamstrings"];
  } else if (primary === "Glutes") {
    if (has("deadlift")) secondary = has("sumo")
      ? ["Hamstrings", "Lower Back", "Adductors", "Quadriceps"]
      : ["Hamstrings", "Lower Back", "Quadriceps"];
    else if (has("clamshell", "fire hydrant", "lateral")) secondary = ["Abductors"];
    else if (has("pull through", "reverse hyper")) secondary = ["Hamstrings", "Lower Back"];
    else if (has("bridge", "hip thrust", "kickback", "rear kick", "frog pump")) secondary = ["Hamstrings"];
    else if (has("bird dog")) secondary = ["Abdominals", "Lower Back", "Shoulders"];
  } else if (primary === "Hamstrings") {
    if (has("romanian", "straight leg", "good morning")) secondary = ["Glutes", "Lower Back"];
    else if (has("glute ham", "nordic")) secondary = ["Glutes", "Calves"];
    else if (has("curl")) secondary = ["Calves"];
  } else if (primary === "Lower Back") {
    if (has("superman")) secondary = ["Glutes", "Hamstrings", "Upper Back"];
    else secondary = ["Glutes", "Hamstrings"];
  } else if (primary === "Abdominals") {
    if (has("ab wheel")) secondary = ["Shoulders", "Lats"];
    else if (has("hanging", "toes to bar")) secondary = ["Forearms", "Lats"];
    else if (has("parallel bars", "l-sit")) secondary = ["Triceps", "Shoulders"];
    else if (has("side plank")) secondary = ["Shoulders", "Abductors"];
    else if (has("reverse plank")) secondary = ["Glutes", "Hamstrings", "Shoulders"];
    else if (has("plank", "spiderman", "mountain")) secondary = ["Shoulders", "Glutes"];
    else if (has("dragon flag", "dragonfly")) secondary = ["Lats", "Glutes"];
  } else if (primary === "Cardio") {
    if (has("rowing")) secondary = ["Upper Back", "Lats", "Biceps", "Quadriceps", "Glutes"];
    else if (has("air bike")) secondary = ["Quadriceps", "Hamstrings", "Glutes", "Shoulders"];
    else if (has("battle ropes")) secondary = ["Shoulders", "Upper Back", "Abdominals"];
    else if (has("boxing")) secondary = ["Shoulders", "Triceps", "Abdominals", "Calves"];
    else if (has("jump rope")) secondary = ["Calves", "Quadriceps", "Shoulders"];
    else if (has("running", "treadmill", "elliptical", "spinning", "stair")) secondary = ["Quadriceps", "Hamstrings", "Glutes", "Calves"];
  } else if (primary === "Full Body") {
    if (has("clean", "snatch")) secondary = ["Quadriceps", "Glutes", "Hamstrings", "Traps", "Shoulders"];
    else if (has("jerk", "thruster", "wall ball", "squat and press")) secondary = ["Quadriceps", "Glutes", "Shoulders", "Triceps", "Abdominals"];
    else if (has("burpee")) secondary = ["Chest", "Shoulders", "Triceps", "Quadriceps", "Glutes"];
    else if (has("front lever")) secondary = ["Lats", "Upper Back", "Abdominals", "Shoulders"];
    else if (has("handstand")) secondary = ["Shoulders", "Triceps", "Abdominals"];
    else if (has("farmers walk")) secondary = ["Forearms", "Traps", "Abdominals", "Glutes"];
    else if (has("kettlebell swing")) secondary = ["Glutes", "Hamstrings", "Lower Back", "Abdominals"];
    else if (has("turkish")) secondary = ["Shoulders", "Abdominals", "Glutes", "Triceps"];
    else if (has("muscle up")) secondary = ["Lats", "Biceps", "Chest", "Triceps", "Shoulders"];
    else if (has("sled push")) secondary = ["Quadriceps", "Glutes", "Calves", "Shoulders"];
    else if (has("row")) secondary = ["Quadriceps", "Glutes", "Lats", "Upper Back", "Biceps"];
    else if (has("overhead squat")) secondary = ["Quadriceps", "Glutes", "Shoulders", "Abdominals"];
    else if (has("high knee", "jumping jack")) secondary = ["Quadriceps", "Glutes", "Calves", "Shoulders"];
    else if (has("ball slam")) secondary = ["Shoulders", "Lats", "Abdominals", "Quadriceps"];
    else if (has("downward dog")) secondary = ["Shoulders", "Hamstrings", "Calves"];
    else if (has("mountain climber")) secondary = ["Abdominals", "Shoulders", "Quadriceps"];
    else if (has("jump shrug", "high pull")) secondary = ["Traps", "Glutes", "Hamstrings", "Quadriceps"];
  } else if (primary === "Traps") {
    secondary = ["Forearms"];
  }

  return unique(primary, secondary);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const result = await client.query(
  'SELECT id, name, muscle FROM "Exercise" WHERE "createdByUserId" IS NULL ORDER BY name'
);
const assignments = result.rows.map((exercise) => ({
  ...exercise,
  secondaryMuscles: classify(exercise.name, exercise.muscle),
}));

if (process.argv.includes("--dry-run")) {
  const distribution = assignments.reduce((counts, exercise) => {
    const key = String(exercise.secondaryMuscles.length);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const byPrimary = assignments.reduce((counts, exercise) => {
    const current = counts[exercise.muscle] ?? { total: 0, classified: 0 };
    current.total += 1;
    if (exercise.secondaryMuscles.length > 0) current.classified += 1;
    counts[exercise.muscle] = current;
    return counts;
  }, {});
  console.log(JSON.stringify({ distribution, byPrimary }, null, 2));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(assignments, null, 2));
  }
  if (process.argv.includes("--unclassified")) {
    console.log(
      assignments
        .filter((exercise) => exercise.secondaryMuscles.length === 0)
        .map((exercise) => `${exercise.muscle}: ${exercise.name}`)
        .join("\n")
    );
  }
  await client.end();
  process.exit(0);
}

await client.query("BEGIN");
try {
  for (const exercise of assignments) {
    await client.query(
      'UPDATE "Exercise" SET "secondaryMuscles" = $1, "updatedAt" = NOW() WHERE id = $2',
      [exercise.secondaryMuscles, exercise.id]
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

const classifiedCount = assignments.filter(
  (exercise) => exercise.secondaryMuscles.length > 0
).length;
console.log(
  `Updated ${assignments.length} global exercises; ${classifiedCount} received secondary muscles.`
);
