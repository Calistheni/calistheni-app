import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySupplementCalendarStates, toSupplementCalendarDateKey } from "../lib/supplement-calendar.ts";

const start = new Date("2026-08-03T00:00:00.000Z");
const end = new Date("2026-08-10T00:00:00.000Z");
const plan = (overrides: Partial<{ frequency: string; weekdays: number[]; everyNDays: number | null; createdAt: Date; archivedAt: Date | null; logs: Array<{ scheduledFor: Date; name?: string; dosage?: string | null; unit?: string | null; completedAt?: Date }> }> = {}) => ({
  frequency: "DAILY", weekdays: [], everyNDays: null, createdAt: start, archivedAt: null, logs: [], ...overrides,
});

test("daily supplement calendar states distinguish none, missed, partial, and complete", () => {
  assert.equal(buildDailySupplementCalendarStates([], start, end)[0]?.status, "none");
  const states = buildDailySupplementCalendarStates([
    plan({ logs: [{ scheduledFor: new Date("2026-08-03T00:00:00.000Z") }] }),
    plan(),
  ], start, end);
  assert.deepEqual(states[0], { date: "2026-08-03", scheduled: 2, completed: 1, status: "partial", completedSupplements: [{ name: "Supplement", dosage: null, unit: null, completedAt: null }] });
  assert.deepEqual(states[1], { date: "2026-08-04", scheduled: 2, completed: 0, status: "missed", completedSupplements: [] });
  assert.equal(buildDailySupplementCalendarStates([plan({ logs: [{ scheduledFor: start }] })], start, end)[0]?.status, "complete");
});

test("calendar adherence respects selected weekdays, as-needed plans, start dates, and archived periods", () => {
  const states = buildDailySupplementCalendarStates([
    plan({ frequency: "SELECTED_WEEKDAYS", weekdays: [1, 3] }),
    plan({ frequency: "AS_NEEDED" }),
    plan({ createdAt: new Date("2026-08-05T00:00:00.000Z") }),
    plan({ archivedAt: new Date("2026-08-06T00:00:00.000Z") }),
  ], start, end);
  assert.equal(states.find((state) => state.date === "2026-08-03")?.scheduled, 2);
  assert.equal(states.find((state) => state.date === "2026-08-04")?.scheduled, 1);
  assert.equal(states.find((state) => state.date === "2026-08-05")?.scheduled, 3);
  assert.equal(states.find((state) => state.date === "2026-08-06")?.scheduled, 1);
});

test("calendar date keys use stable UTC calendar days without previous or next-day shifts", () => {
  assert.equal(toSupplementCalendarDateKey(new Date("2026-08-03T23:59:59.000Z")), "2026-08-03");
  assert.equal(toSupplementCalendarDateKey(new Date("2026-08-04T00:00:00.000Z")), "2026-08-04");
});

test("an actually logged as-needed dose is calendar activity without a missed schedule", () => {
  const states = buildDailySupplementCalendarStates([
    plan({ frequency: "AS_NEEDED", logs: [{ scheduledFor: start, name: "Magnesium", dosage: "200", unit: "mg", completedAt: new Date("2026-08-03T21:00:00.000Z") }] }),
  ], start, end);
  assert.deepEqual(states[0], {
    date: "2026-08-03",
    scheduled: 0,
    completed: 1,
    status: "complete",
    completedSupplements: [{ name: "Magnesium", dosage: "200", unit: "mg", completedAt: "2026-08-03T21:00:00.000Z" }],
  });
});

test("training calendar exposes private daily details through blue filter controls", async () => {
  const fs = await import("node:fs/promises");
  const [source, service, homePage, presentation] = await Promise.all([
    fs.readFile(new URL("../components/home/TrainingActivityCalendar.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../lib/supplement-service.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/home/page.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../lib/training-activity-calendar.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /useState<TrainingActivityFilter>\("all"\)/);
  assert.match(source, /bg-primary/);
  assert.doesNotMatch(presentation, /red|clip-path/);
  assert.match(source, /aria-pressed=\{filter === option\.value\}/);
  assert.match(source, /Workout completed/);
  assert.match(source, /Supplements taken/);
  assert.match(source, /Workout and supplements/);
  assert.match(source, /supplement\.dosage/);
  assert.match(source, /activity level \$\{activityIntensity\} of 4/);
  assert.match(service, /where: \{ userId, createdAt: \{ lt: end \}/);
  assert.match(service, /scheduledFor: \{ gte: start, lt: end \}/);
  assert.match(homePage, /getDailySupplementCalendarAdherence\(session\.user\.id/);
});
