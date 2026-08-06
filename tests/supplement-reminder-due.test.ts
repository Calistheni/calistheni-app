import assert from "node:assert/strict";
import test from "node:test";
import { incompleteDueSupplementPlans, isReminderPlanDueOn, localDateKey, supplementReminderBody, weekdayForDateKey } from "../lib/supplement-reminder-due";
import { supplementReminderNotificationId } from "../lib/native/supplement-reminders";

const base = { customName: "Creatine", frequency: "DAILY", weekdays: [], everyNDays: null, isActive: true, archivedAt: null, createdAt: "2026-08-01T08:00:00.000Z", logs: [] };

test("reminder due status handles daily, weekdays, archived, pre-start and as-needed plans", () => {
  assert.equal(isReminderPlanDueOn({ ...base, id: "daily" }, "2026-08-06", "Europe/Sofia"), true);
  assert.equal(isReminderPlanDueOn({ ...base, id: "weekday", frequency: "SELECTED_WEEKDAYS", weekdays: [4] }, "2026-08-06"), true);
  assert.equal(isReminderPlanDueOn({ ...base, id: "weekday", frequency: "SELECTED_WEEKDAYS", weekdays: [1] }, "2026-08-06"), false);
  assert.equal(isReminderPlanDueOn({ ...base, id: "needed", frequency: "AS_NEEDED" }, "2026-08-06"), false);
  assert.equal(isReminderPlanDueOn({ ...base, id: "archive", archivedAt: "2026-08-05T12:00:00.000Z" }, "2026-08-06"), false);
  assert.equal(isReminderPlanDueOn({ ...base, id: "future", createdAt: "2026-08-07T08:00:00.000Z" }, "2026-08-06"), false);
});

test("completed due plans are excluded and multiple incomplete plans create one concise summary", () => {
  const plans = [
    { ...base, id: "taken", logs: [{ scheduledFor: "2026-08-06T00:00:00.000Z" }] },
    { ...base, id: "left", customName: "Vitamin D" },
    { ...base, id: "left2", customName: "Magnesium" },
  ];
  const incomplete = incompleteDueSupplementPlans(plans, "2026-08-06", "Europe/Sofia");
  assert.deepEqual(incomplete.map((plan) => plan.id), ["left", "left2"]);
  assert.equal(supplementReminderBody(incomplete), "Vitamin D, and Magnesium are still untaken.");
  assert.equal(incompleteDueSupplementPlans([plans[0]], "2026-08-06").length, 0);
});

test("local date keys do not use UTC day and notification IDs are deterministic, date-specific, and safe", () => {
  assert.equal(localDateKey(new Date("2026-08-06T00:30:00.000Z"), "America/Los_Angeles"), "2026-08-05");
  assert.equal(weekdayForDateKey("2026-08-06"), 4);
  const first = supplementReminderNotificationId("2026-08-06");
  assert.equal(first, supplementReminderNotificationId("2026-08-06"));
  assert.notEqual(first, supplementReminderNotificationId("2026-08-07"));
  assert.ok(first > 1_500_000_000 && first < 2_147_483_647);
});
