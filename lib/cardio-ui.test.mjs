import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("Cardio card uses real radial progress and Calistheni chart tokens", async () => {
  const card = await readFile(
    new URL("components/profile/CardioGoalCard.tsx", projectRoot),
    "utf8"
  );

  assert.match(card, /Weekly cardio goal/);
  assert.match(card, /RadialBarChart/);
  assert.match(card, /dataKey="progress"/);
  assert.match(card, /domain=\{\[0, 100\]\}/);
  assert.match(card, /CALISTHENI_CHART_BLUE/);
  assert.match(card, /completedSeconds/);
  assert.doesNotMatch(card, /Browser|Safari|Visitors/);
});

test("Cardio goal and activity flows use responsive shadcn surfaces", async () => {
  const card = await readFile(
    new URL("components/profile/CardioGoalCard.tsx", projectRoot),
    "utf8"
  );

  assert.match(card, /<Drawer/);
  assert.match(card, /<Dialog/);
  assert.match(card, /Set goal/);
  assert.match(card, /Edit cardio goal/);
  assert.match(card, /View activity/);
  assert.match(card, /safe-area-inset-bottom/);
  assert.match(card, /aria-label=\{accessibleText\}/);
});

test("goal endpoint authenticates ownership and returns typed errors", async () => {
  const route = await readFile(
    new URL("app/api/user/cardio-goal/route.ts", projectRoot),
    "utf8"
  );

  assert.match(route, /getAuthenticatedUserId/);
  assert.match(route, /CARDIO_GOAL_INVALID/);
  assert.match(route, /CARDIO_GOAL_UPDATE_FAILED/);
  assert.match(route, /where: \{ id: userId \}/);
  assert.doesNotMatch(route, /body\.userId/);
});

test("weekly Cardio goal migration is additive and nullable", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", projectRoot), "utf8"),
    readFile(
      new URL(
        "prisma/migrations/20260728100000_add_weekly_cardio_goal/migration.sql",
        projectRoot
      ),
      "utf8"
    ),
  ]);

  assert.match(schema, /weeklyCardioGoalMinutes\s+Int\?/);
  assert.match(migration, /ADD COLUMN "weeklyCardioGoalMinutes" INTEGER/);
  assert.doesNotMatch(migration, /DROP|TRUNCATE|DELETE/i);
});

test("Profile places Cardio beside the muscle chart with a mobile stack", async () => {
  const profile = await readFile(
    new URL("app/profile/page.tsx", projectRoot),
    "utf8"
  );

  assert.match(profile, /<MuscleActivityRadar/);
  assert.match(profile, /<CardioGoalCard/);
  assert.match(profile, /grid items-stretch gap-6 lg:grid-cols/);
  assert.match(profile, /CARDIO_PROGRESS_FAILED/);
});
