import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_MUSCLE_CATEGORIES,
  aggregateCompletedSetsByMuscle,
  getRadarCategoryForMuscle,
  getMuscleContributionWeight,
} from "./muscle-activity.ts";

test("radar exposes exactly the eight strength categories", () => {
  assert.deepEqual(RADAR_MUSCLE_CATEGORIES, [
    "Chest",
    "Back",
    "Shoulders",
    "Biceps",
    "Triceps",
    "Core",
    "Glutes",
    "Legs",
  ]);
  assert.equal(RADAR_MUSCLE_CATEGORIES.includes("Cardio"), false);
  assert.equal(RADAR_MUSCLE_CATEGORIES.includes("Forearms"), false);
});

test("detailed taxonomy maps to canonical radar categories", () => {
  assert.equal(getRadarCategoryForMuscle("Upper chest"), "Chest");
  assert.equal(getRadarCategoryForMuscle("Lats"), "Back");
  assert.equal(getRadarCategoryForMuscle("Rear deltoids"), "Shoulders");
  assert.equal(getRadarCategoryForMuscle("Brachialis"), "Biceps");
  assert.equal(getRadarCategoryForMuscle("Triceps"), "Triceps");
  assert.equal(getRadarCategoryForMuscle("Obliques"), "Core");
  assert.equal(getRadarCategoryForMuscle("Gluteus medius"), "Glutes");
  assert.equal(getRadarCategoryForMuscle("Quadriceps"), "Legs");
  assert.equal(getRadarCategoryForMuscle("Hamstrings"), "Legs");
  assert.equal(getRadarCategoryForMuscle("Calves"), "Legs");
  assert.equal(getRadarCategoryForMuscle("Forearms"), null);
  assert.equal(getRadarCategoryForMuscle("Cardio"), null);
});

test("direct sets count once and assisting categories count as half workload", () => {
  const result = aggregateCompletedSetsByMuscle([
    {
      aggregationId: 1,
      primaryMuscle: "Quadriceps",
      secondaryMuscles: ["Hamstrings", "Glutes", "Hamstrings"],
    },
    {
      aggregationId: 2,
      primaryMuscle: "Quadriceps",
      secondaryMuscles: ["Hamstrings", "Glutes"],
    },
  ]);
  const legs = result.find((point) => point.muscle === "Legs");
  const glutes = result.find((point) => point.muscle === "Glutes");

  assert.deepEqual(legs, {
    muscle: "Legs",
    directSets: 2,
    assistingSets: 0,
    assistingWorkload: 0,
    workloadScore: 2,
  });
  assert.equal(glutes?.directSets, 0);
  assert.equal(glutes?.assistingSets, 2);
  assert.equal(glutes?.workloadScore, 1);
});

test("one lunge set contributes once to Legs and primary overrides assisting roles", () => {
  const result = aggregateCompletedSetsByMuscle([
    {
      aggregationId: "lunge-set",
      primaryMuscle: "Quadriceps",
      secondaryMuscles: ["Hamstrings", "Calves", "Glutes"],
    },
  ]);

  const legs = result.find((point) => point.muscle === "Legs");
  const glutes = result.find((point) => point.muscle === "Glutes");

  assert.equal(legs?.directSets, 1);
  assert.equal(legs?.assistingSets, 0);
  assert.equal(legs?.workloadScore, 1);
  assert.equal(glutes?.directSets, 0);
  assert.equal(glutes?.assistingSets, 1);
  assert.equal(glutes?.workloadScore, 0.5);
});

test("multiple detailed Back muscles do not inflate one set", () => {
  const result = aggregateCompletedSetsByMuscle([
    {
      aggregationId: "pull-up-set",
      primaryMuscle: "Lats",
      secondaryMuscles: ["Upper Back", "Forearms", "Biceps"],
    },
  ]);

  assert.equal(
    result.find((point) => point.muscle === "Back")?.workloadScore,
    1
  );
  assert.equal(
    result.find((point) => point.muscle === "Biceps")?.workloadScore,
    0.5
  );
});

test("Cardio-primary sets never affect strength radar categories", () => {
  const result = aggregateCompletedSetsByMuscle([
    {
      aggregationId: "running-set",
      primaryMuscle: "Cardio",
      secondaryMuscles: ["Quadriceps", "Glutes"],
    },
  ]);

  assert.ok(result.every((point) => point.workloadScore === 0));
});

test("duplicate set identities and duplicate muscle aliases do not double count", () => {
  const result = aggregateCompletedSetsByMuscle([
    {
      aggregationId: "set-1",
      primaryMuscle: "Chest",
      secondaryMuscles: ["Triceps", "Triceps"],
    },
    {
      aggregationId: "set-1",
      primaryMuscle: "Chest",
      secondaryMuscles: ["Triceps"],
    },
  ]);

  assert.equal(result.find((point) => point.muscle === "Chest")?.workloadScore, 1);
  assert.equal(
    result.find((point) => point.muscle === "Triceps")?.workloadScore,
    0.5
  );
});

test("the documented muscle contribution weights remain stable", () => {
  assert.equal(getMuscleContributionWeight("PRIMARY"), 1);
  assert.equal(getMuscleContributionWeight("SECONDARY"), 0.5);
});
