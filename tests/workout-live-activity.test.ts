import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridge = new URL("../lib/native/workout-live-activity.ts", import.meta.url);
const plugin = new URL("../ios/App/App/WorkoutLiveActivityPlugin.swift", import.meta.url);
const widget = new URL("../ios/App/App/CalistheniWorkoutWidget/WorkoutLiveActivity.swift", import.meta.url);

test("workout Live Activity bridge is iOS-only and deduplicates unchanged content", async () => {
  const source = await readFile(bridge, "utf8");
  assert.match(source, /isIOSApp\(\) && isNativePluginAvailable\("WorkoutLiveActivity"\)/);
  assert.match(source, /if \(key === lastStateKey\) return true/);
  assert.match(source, /WorkoutLiveActivity\.start\(state\)/);
  assert.match(source, /WorkoutLiveActivity\.update\(state\)/);
  assert.match(source, /WorkoutLiveActivity\.end/);
});

test("native implementation uses ActivityKit and a WidgetKit Live Activity rather than notifications", async () => {
  const [pluginSource, widgetSource] = await Promise.all([
    readFile(plugin, "utf8"),
    readFile(widget, "utf8"),
  ]);
  assert.match(pluginSource, /import ActivityKit/);
  assert.match(pluginSource, /Activity<WorkoutActivityAttributes>\.activities/);
  assert.match(pluginSource, /Activity\.request/);
  assert.match(widgetSource, /import WidgetKit/);
  assert.match(widgetSource, /ActivityConfiguration\(for: WorkoutActivityAttributes\.self\)/);
  assert.match(widgetSource, /DynamicIsland/);
  assert.doesNotMatch(pluginSource, /LocalNotifications/);
});
