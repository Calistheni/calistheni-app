import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("rest timer uses endsAt absolute time and one completion ID guard", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  assert.match(source, /Math\.ceil\(\(activeTimer\.endsAtMs - nowMs\) \/ 1000\)/);
  assert.match(source, /now >= activeTimer\.endsAtMs/);
  assert.match(source, /completedTimerIdRef\.current === timer\.id/);
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test("rest sound preference persists and does not become muted on playback failure", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  assert.match(source, /calistheni-rest-sound-muted/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /foreground audio failed/);
  assert.doesNotMatch(source, /setIsMuted\(true\)/);
});

test("native background safety uses a separate rest notification namespace", async () => {
  const source = await readFile(new URL("../lib/native/rest-timer-notifications.ts", import.meta.url), "utf8");
  assert.match(source, /REST_NOTIFICATION_BASE = 1_200_000_000/);
  assert.match(source, /rest-timer-v1/);
  assert.match(source, /allowWhileIdle: true/);
  assert.match(source, /sound: "default"/);
});

test("background, adjustment, cancellation, and foreground completion cancel stale rest feedback", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  assert.match(source, /scheduleRestTimerNotification/);
  assert.match(source, /cancelRestTimerNotification/);
  assert.match(source, /timer-adjusted/);
  assert.match(source, /skipped/);
  assert.match(source, /appStateChange/);
  assert.match(source, /nativeSoundDelivered/);
});
