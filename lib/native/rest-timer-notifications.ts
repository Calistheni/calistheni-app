import { LocalNotifications } from "@capacitor/local-notifications";
import { isAndroidApp, isNativePluginAvailable } from "@/lib/native/platform";

// Deliberately separate from supplement IDs (1_500_000_000+).
const REST_NOTIFICATION_BASE = 1_200_000_000;
const REST_SOUND_CHANNEL_ID = "rest-timer-sound-v2";
const REST_SILENT_CHANNEL_ID = "rest-timer-silent-v2";

function available() { return isNativePluginAvailable("LocalNotifications"); }

export function restTimerNotificationId(timerId: string) {
  let hash = 0;
  for (const char of timerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return REST_NOTIFICATION_BASE + (hash % 100_000_000);
}

async function ensureChannels() {
  if (!isAndroidApp()) return;
  await Promise.all([
    LocalNotifications.createChannel({ id: REST_SOUND_CHANNEL_ID, name: "Rest timer", description: "Workout rest completion", importance: 4, visibility: 1, sound: "default", vibration: true }),
    LocalNotifications.createChannel({ id: REST_SILENT_CHANNEL_ID, name: "Rest timer (silent)", description: "Muted workout rest completion", importance: 3, visibility: 1, sound: undefined, vibration: false }),
  ]);
}

export async function scheduleRestTimerNotification(timer: { id: string; workoutId: string }, endsAtMs: number, soundEnabled: boolean) {
  if (!available() || endsAtMs <= Date.now()) return false;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return false;
  await ensureChannels();
  const id = restTimerNotificationId(timer.id);
  // The ID is deterministic per rest session. Cancel first so duplicate lifecycle events
  // can only replace the same notification, never add another Notification Center entry.
  await LocalNotifications.cancel({ notifications: [{ id }] });
  await LocalNotifications.schedule({ notifications: [{ id, title: "Rest complete", body: "Time for your next set.", schedule: { at: new Date(endsAtMs), allowWhileIdle: true }, extra: { type: "rest-timer", workoutId: timer.workoutId, timerId: timer.id, timerSessionId: timer.id }, ...(isAndroidApp() ? { channelId: soundEnabled ? REST_SOUND_CHANNEL_ID : REST_SILENT_CHANNEL_ID } : {}), ...(soundEnabled ? { sound: "default" } : {}) }] });
  return true;
}

export async function cancelRestTimerNotification(timerId: string, reason: string) {
  if (!available()) return;
  await LocalNotifications.cancel({ notifications: [{ id: restTimerNotificationId(timerId) }] });
  if (process.env.NODE_ENV === "development") console.info("[RestTimer] notification cancelled", { id: restTimerNotificationId(timerId), reason });
}

/** Targeted cleanup only; supplement notifications never share this ID range. */
export async function removeDeliveredRestTimerNotification(timerId: string) {
  if (!available()) return;
  const id = restTimerNotificationId(timerId);
  const delivered = await LocalNotifications.getDeliveredNotifications();
  const matching = delivered.notifications.filter((notification) => {
    const extra = notification.extra as { type?: string; timerId?: string } | undefined;
    return notification.id === id && extra?.type === "rest-timer" && extra.timerId === timerId;
  });
  if (matching.length) await LocalNotifications.removeDeliveredNotifications({ notifications: matching });
}
