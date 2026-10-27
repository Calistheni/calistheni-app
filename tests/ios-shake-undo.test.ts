import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("iOS disables only the system shake-to-edit presentation", async () => {
  const [delegate, controller, workout] = await Promise.all([
    readFile(new URL("../ios/App/App/AppDelegate.swift", import.meta.url), "utf8"),
    readFile(
      new URL("../ios/App/App/MainViewController.swift", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(
    delegate,
    /didFinishLaunchingWithOptions[\s\S]*application\.applicationSupportsShakeToEdit = false/
  );
  assert.doesNotMatch(
    `${delegate}\n${controller}`,
    /motion(?:Began|Ended|Cancelled)|sendEvent|canPerformAction|undoManager/
  );
  assert.doesNotMatch(workout, /devicemotion|deviceorientation/);
});
