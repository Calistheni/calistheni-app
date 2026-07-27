import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCompletedSetsByMuscle,
  getMuscleContributionWeight,
} from "./muscle-activity.ts";

test("primary sets count once and secondary groups count as half workload", () => {
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
    primarySets: 2,
    secondaryContributions: 0,
    workloadSets: 2,
    sets: 2,
  });
  assert.equal(glutes?.primarySets, 0);
  assert.equal(glutes?.secondaryContributions, 2);
  assert.equal(glutes?.workloadSets, 1);
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

  assert.equal(result.find((point) => point.muscle === "Chest")?.workloadSets, 1);
  assert.equal(
    result.find((point) => point.muscle === "Triceps")?.workloadSets,
    0.5
  );
});

test("the documented muscle contribution weights remain stable", () => {
  assert.equal(getMuscleContributionWeight("PRIMARY"), 1);
  assert.equal(getMuscleContributionWeight("SECONDARY"), 0.5);
});
