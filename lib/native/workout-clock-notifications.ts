import { LocalNotifications } from "@capacitor/local-notifications";
import { isAndroidApp, isNativePluginAvailable } from "@/lib/native/platform";

// Separate from rest timers (1.2B+) and supplement reminders (1.5B+).
const WORKOUT_CLOCK_NOTIFICATION_BASE = 1_100_000_000;
const SOUND_CHANNEL_ID = "workout-clock-sound";
const SILENT_CHANNEL_ID = "workout-clock-silent";

function available() {
  return isNativePluginAvailable("LocalNotifications");
}

export function workoutClockNotificationId(runId: string) {
  let hash = 0;
  for (const character of runId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return WORKOUT_CLOCK_NOTIFICATION_BASE + (hash % 100_000_000);
}

async function ensureChannels() {
  if (!isAndroidApp()) return;
  await Promise.all([
    LocalNotifications.createChannel({ id: SOUND_CHANNEL_ID, name: "Workout clock", description: "Manual workout timer completion", importance: 4, visibility: 1, sound: "default", vibration: true }),
    LocalNotifications.createChannel({ id: SILENT_CHANNEL_ID, name: "Workout clock (silent)", description: "Muted manual workout timer completion", importance: 3, visibility: 1, sound: undefined, vibration: false }),
  ]);
}

export async function scheduleWorkoutClockNotification({ runId, workoutId, endsAtMs, soundEnabled }: { runId: string; workoutId: string; endsAtMs: number; soundEnabled: boolean }) {
  if (!available() || endsAtMs <= Date.now()) return false;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return false;
  await ensureChannels();
  const id = workoutClockNotificationId(runId);
  await LocalNotifications.cancel({ notifications: [{ id }] });
  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: "Workout timer complete",
      body: "Your manual timer has finished.",
      schedule: { at: new Date(endsAtMs), allowWhileIdle: true },
      extra: { type: "workout-clock", workoutId, runId },
      ...(isAndroidApp() ? { channelId: soundEnabled ? SOUND_CHANNEL_ID : SILENT_CHANNEL_ID } : {}),
      ...(soundEnabled ? { sound: "default" } : {}),
    }],
  });
  return true;
}

export async function cancelWorkoutClockNotification(runId: string) {
  if (!available()) return;
  await LocalNotifications.cancel({ notifications: [{ id: workoutClockNotificationId(runId) }] });
}
