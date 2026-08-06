import { LocalNotifications } from "@capacitor/local-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { isAndroidApp, isNativePluginAvailable } from "@/lib/native/platform";
import { incompleteDueSupplementPlans, localDateKey, supplementReminderBody, type ReminderPlan } from "@/lib/supplement-reminder-due";

const WINDOW_DAYS = 21;
const NOTIFICATION_BASE = 1_500_000_000;
const NOTIFICATION_LIMIT = NOTIFICATION_BASE + 200_000_000;
const CHANNEL_ID = "supplement-reminders";
let notificationActionListener: PluginListenerHandle | undefined;

export type ReminderPermission = "unavailable" | "prompt" | "granted" | "denied";
export type ReminderSettings = { enabled: boolean; reminderHour: number; reminderMinute: number; timezone: string | null };

export function supplementReminderNotificationId(dateKey: string) {
  const digits = Number(dateKey.replaceAll("-", ""));
  if (!Number.isInteger(digits)) throw new Error("Invalid reminder date key.");
  const id = NOTIFICATION_BASE + digits;
  if (id > NOTIFICATION_LIMIT || id > 2_147_483_647) throw new Error("Reminder notification ID is outside the supported range.");
  return id;
}

export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function nativeNotificationsAvailable() { return isNativePluginAvailable("LocalNotifications"); }
function toPermission(display: string): ReminderPermission {
  return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
}
export async function checkSupplementReminderPermission(): Promise<ReminderPermission> {
  if (!nativeNotificationsAvailable()) return "unavailable";
  try { return toPermission((await LocalNotifications.checkPermissions()).display); }
  catch (error) { console.warn("[supplement-reminders] permission check failed", error); return "unavailable"; }
}
export async function requestSupplementReminderPermission(): Promise<ReminderPermission> {
  if (!nativeNotificationsAvailable()) return "unavailable";
  try { return toPermission((await LocalNotifications.requestPermissions()).display); }
  catch (error) { console.warn("[supplement-reminders] permission request failed", error); return "unavailable"; }
}

function dateAtLocalTime(date: Date, hour: number, minute: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}
function upcomingLocalDates(now = new Date()) {
  return Array.from({ length: WINDOW_DAYS }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 12));
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Reminder request failed (${response.status}).`);
  return response.json() as Promise<T>;
}
async function ensureAndroidChannel() {
  if (!isAndroidApp()) return;
  await LocalNotifications.createChannel({ id: CHANNEL_ID, name: "Supplement reminders", description: "Reminders for scheduled supplements", importance: 3, visibility: 1, sound: "default", vibration: true });
}
export async function cancelAllSupplementReminders() {
  if (!nativeNotificationsAvailable()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const reminders = pending.notifications.filter((notification) => notification.id >= NOTIFICATION_BASE && notification.id <= NOTIFICATION_LIMIT).map(({ id }) => ({ id }));
    if (reminders.length) await LocalNotifications.cancel({ notifications: reminders });
  } catch (error) { console.warn("[supplement-reminders] cancellation failed", error); }
}

/** Rebuilds the rolling local-notification window from current server state.
 * Local notifications cannot query Prisma at delivery time; this is the repair point. */
export async function reconcileSupplementReminders() {
  if (!nativeNotificationsAvailable()) return { scheduled: 0, skipped: "browser" as const };
  const permission = await checkSupplementReminderPermission();
  if (permission !== "granted") return { scheduled: 0, skipped: permission };
  try {
    const [settings, supplementData] = await Promise.all([
      api<ReminderSettings>("/api/user/supplements/reminders"),
      api<{ plans: ReminderPlan[] }>("/api/user/supplements"),
    ]);
    if (!settings.enabled) { await cancelAllSupplementReminders(); return { scheduled: 0, skipped: "disabled" as const }; }
    const timeZone = deviceTimeZone();
    if (settings.timezone !== timeZone) {
      await api<ReminderSettings>("/api/user/supplements/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone: timeZone }) });
    }
    await ensureAndroidChannel();
    const now = new Date();
    const wanted = new Map<number, { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean }; extra: { type: string; route: string; dateKey: string }; channelId?: string; sound: string }>();
    for (const date of upcomingLocalDates(now)) {
      const dateKey = localDateKey(date, timeZone);
      const at = dateAtLocalTime(date, settings.reminderHour, settings.reminderMinute);
      if (at <= now) continue;
      const incomplete = incompleteDueSupplementPlans(supplementData.plans, dateKey, timeZone);
      if (!incomplete.length) continue;
      const id = supplementReminderNotificationId(dateKey);
      wanted.set(id, { id, title: "Supplement reminder", body: supplementReminderBody(incomplete), schedule: { at, allowWhileIdle: true }, extra: { type: "supplement-reminder", route: "/profile/supplements", dateKey }, ...(isAndroidApp() ? { channelId: CHANNEL_ID } : {}), sound: "default" });
    }
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter((notification) => notification.id >= NOTIFICATION_BASE && notification.id <= NOTIFICATION_LIMIT && !wanted.has(notification.id)).map(({ id }) => ({ id }));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale });
    if (wanted.size) await LocalNotifications.schedule({ notifications: [...wanted.values()] });
    return { scheduled: wanted.size, skipped: null };
  } catch (error) { console.warn("[supplement-reminders] reconciliation failed", error); return { scheduled: 0, skipped: "error" as const }; }
}

export async function registerSupplementNotificationListeners() {
  if (!nativeNotificationsAvailable() || notificationActionListener) return;
  try {
    notificationActionListener = await LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
      const extra = notification.extra as { type?: unknown; route?: unknown } | undefined;
      if (extra?.type !== "supplement-reminder" || extra.route !== "/profile/supplements") return;
      window.location.assign("/profile/supplements");
    });
  } catch (error) { console.warn("[supplement-reminders] listener registration failed", error); }
}
export async function removeSupplementNotificationListeners() {
  await notificationActionListener?.remove(); notificationActionListener = undefined;
}
