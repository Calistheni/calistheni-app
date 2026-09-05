import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPlanScheduledOn, supplementPlanSchema } from "./progress.ts";
import { getLocalSupplementDateKey, getSupplementLogEligibility, parseSupplementDateKey } from "./supplement-log.ts";

const root = new URL("../", import.meta.url);
const monday = new Date("2026-08-03T00:00:00.000Z");
const plan = (frequency, weekdays = []) => ({ frequency, weekdays, everyNDays: null, createdAt: monday });

test("supplement plan validation accepts daily, weekdays, and as-needed plans", () => {
  for (const frequency of ["DAILY", "SELECTED_WEEKDAYS", "AS_NEEDED"]) {
    const value = supplementPlanSchema.safeParse({ customName: "Creatine", dosage: 5, unit: "g", frequency, weekdays: frequency === "SELECTED_WEEKDAYS" ? [1, 3] : [] });
    assert.equal(value.success, true);
  }
  assert.equal(supplementPlanSchema.safeParse({ customName: "Creatine", frequency: "SELECTED_WEEKDAYS", weekdays: [] }).success, false);
  assert.equal(supplementPlanSchema.safeParse({ customName: "Creatine", dosage: -1, unit: "g", frequency: "DAILY" }).success, false);
  assert.equal(supplementPlanSchema.safeParse({ customName: "Creatine", unit: "oz", frequency: "DAILY" }).success, false);
});

test("schedule helper respects daily, weekdays, as-needed, and plan start", () => {
  assert.equal(isPlanScheduledOn(plan("DAILY"), monday), true);
  assert.equal(isPlanScheduledOn(plan("SELECTED_WEEKDAYS", [1]), monday), true);
  assert.equal(isPlanScheduledOn(plan("SELECTED_WEEKDAYS", [1]), new Date("2026-08-04T00:00:00.000Z")), false);
  assert.equal(isPlanScheduledOn(plan("AS_NEEDED"), monday), false);
  assert.equal(isPlanScheduledOn(plan("EVERY_N_DAYS"), new Date("2026-08-02T00:00:00.000Z")), false);
});

test("supplement Take dates are strict local calendar keys and eligibility is schedule-aware", () => {
  assert.equal(getLocalSupplementDateKey(new Date(2026, 7, 4, 0, 15)), "2026-08-04");
  assert.equal(parseSupplementDateKey("2026-08-04")?.toISOString(), "2026-08-04T00:00:00.000Z");
  assert.equal(parseSupplementDateKey("2026-8-4"), null);
  assert.equal(parseSupplementDateKey("2026-02-30"), null);

  const base = { ...plan("DAILY"), archivedAt: null, isActive: true };
  assert.equal(getSupplementLogEligibility(base, monday).eligible, true);
  assert.equal(getSupplementLogEligibility({ ...base, frequency: "SELECTED_WEEKDAYS", weekdays: [1] }, monday).eligible, true);
  assert.equal(getSupplementLogEligibility({ ...base, frequency: "SELECTED_WEEKDAYS", weekdays: [1] }, new Date("2026-08-04T00:00:00.000Z")).eligible, false);
  assert.equal(getSupplementLogEligibility({ ...base, frequency: "AS_NEEDED" }, monday).eligible, true);
  assert.equal(getSupplementLogEligibility({ ...base, isActive: false }, monday).eligible, false);
  assert.equal(getSupplementLogEligibility({ ...base, createdAt: new Date("2026-08-05T00:00:00.000Z") }, monday).eligible, false);
});

test("supplement plan management routes remain ownership-safe and preserve logged plans", async () => {
  const route = await readFile(new URL("app/api/user/supplements/[id]/route.ts", root), "utf8");
  assert.match(route, /where: \{ id, userId \}/);
  assert.match(route, /Plans with completion history are kept as archived history/);
  assert.match(route, /action === "archive"/);
  assert.match(route, /action === "restore"/);
  assert.match(route, /supplementPlanSchema\.safeParse/);
});

test("supplement log route uses the stable scheduledDate contract and idempotent ownership-safe writes", async () => {
  const route = await readFile(new URL("app/api/user/supplements/[id]/logs/route.ts", root), "utf8");
  assert.match(route, /scheduledDate/);
  assert.match(route, /note: optionalNoteSchema\.optional\(\)/);
  assert.match(route, /parseSupplementDateKey/);
  assert.match(route, /getSupplementLogEligibility/);
  assert.match(route, /where: \{ id, userId \}/);
  assert.match(route, /findUnique/);
  assert.match(route, /created: false/);
  assert.match(route, /dosageSnapshot: plan\.dosage/);
  assert.match(route, /unitSnapshot: plan\.unit/);
  assert.match(route, /Invalid supplement completion date/);
  assert.doesNotMatch(route, /scheduledFor: z\.coerce\.date/);
});

test("supplement tracker exposes edit, archive, restore, safe delete, and mobile-safe dialog", async () => {
  const source = await readFile(new URL("components/profile/SupplementTracker.tsx", root), "utf8");
  for (const label of ["Edit plan", "Archive plan", "Restore", "Delete plan", "Today", "Archived", "Take", "Undo"]) assert.match(source, new RegExp(label));
  assert.match(source, /max-h-\[90dvh\] overflow-y-auto/);
  assert.match(source, /DialogTitle/);
  assert.match(source, /createSupplementLogRequest\(plan\.id, today\)/);
  assert.match(source, /disabled=\{pending\}/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /window\.confirm/);
});

test("home workout actions include the responsive Supplements shortcut", async () => {
  const source = await readFile(new URL("components/home/HomeWorkoutOverview.tsx", root), "utf8");
  assert.match(source, /href="\/profile\/supplements"/);
  assert.match(source, /Pill/);
  assert.match(source, /Open Supplements/);
  assert.match(source, /lg:grid-cols-3/);
});
