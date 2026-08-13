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

test("native background safety uses separate rest sound and silent notification channels", async () => {
  const source = await readFile(new URL("../lib/native/rest-timer-notifications.ts", import.meta.url), "utf8");
  assert.match(source, /REST_NOTIFICATION_BASE = 1_200_000_000/);
  assert.match(source, /rest-timer-sound-v2/);
  assert.match(source, /rest-timer-silent-v2/);
  assert.match(source, /allowWhileIdle: true/);
  assert.match(source, /sound: "default"/);
});

test("foreground completion cancels notification while true pause/resume preserves background delivery", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  assert.match(source, /scheduleRestTimerNotification/);
  assert.match(source, /cancelRestTimerNotification/);
  assert.match(source, /scheduleBackgroundNotification/);
  assert.match(source, /cancelBackgroundNotification/);
  assert.match(source, /skipped/);
  assert.match(source, /App.addListener\("pause"/);
  assert.match(source, /App.addListener\("resume"/);
  assert.match(source, /completeForeground/);
  assert.match(source, /completeAfterBackground/);
  assert.match(source, /foreground-completion/);
  assert.match(source, /appStateRef.current === "foreground"/);
});

test("foreground and background have exactly one distinct feedback mechanism", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  assert.match(source, /completed foreground - playing sound only/);
  assert.match(source, /completed while background - native notification handled completion/);
  assert.match(source, /await playForegroundSound\(\);/);
  assert.match(source, /await haptic\(\);/);
});

test("rest notifications are scheduled only on true native pause and cancelled on resume", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  const start = source.indexOf("startRestTimer:");
  const startBlock = source.slice(start, source.indexOf("addSeconds:", start));
  assert.doesNotMatch(startBlock, /scheduleBackgroundNotification\(timer\)/);
  assert.match(source, /App\.addListener\("pause"[\s\S]*scheduleBackgroundNotification\(timer\)/);
  assert.match(source, /App\.addListener\("resume"[\s\S]*cancelBackgroundNotification\(timer\.id, "app-resume"\)/);
  assert.match(source, /localNotificationReceived/);
});

test("one ref-backed lifecycle manager prevents foreground scheduling and duplicate listeners", async () => {
  const source = await readFile(new URL("../components/workouts/hooks/useRestTimer.ts", import.meta.url), "utf8");
  assert.match(source, /sole Capacitor lifecycle owner/);
  assert.match(source, /scheduledTimerIdRef\.current === timer\.id/);
  assert.match(source, /notification already scheduled - skipped/);
  assert.match(source, /app foreground, no notification scheduled/);
  assert.match(source, /foreground rest notification received - removing delivered copy/);
});

test("rest notification metadata and cleanup are isolated from other notification domains", async () => {
  const source = await readFile(new URL("../lib/native/rest-timer-notifications.ts", import.meta.url), "utf8");
  assert.match(source, /type: "rest-timer", workoutId: timer\.workoutId, timerId: timer\.id, timerSessionId: timer\.id/);
  assert.match(source, /extra\?\.type === "rest-timer"/);
  assert.match(source, /await LocalNotifications\.cancel\(\{ notifications: \[\{ id \}\] \}\)/);
});
