import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPlanScheduledOn, supplementPlanSchema } from "./progress.ts";

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

test("supplement plan management routes remain ownership-safe and preserve logged plans", async () => {
  const route = await readFile(new URL("app/api/user/supplements/[id]/route.ts", root), "utf8");
  assert.match(route, /where: \{ id, userId \}/);
  assert.match(route, /Plans with completion history are kept as archived history/);
  assert.match(route, /action === "archive"/);
  assert.match(route, /action === "restore"/);
  assert.match(route, /supplementPlanSchema\.safeParse/);
});

test("supplement tracker exposes edit, archive, restore, safe delete, and mobile-safe dialog", async () => {
  const source = await readFile(new URL("components/profile/SupplementTracker.tsx", root), "utf8");
  for (const label of ["Edit plan", "Archive plan", "Restore", "Delete plan", "Today", "Archived", "Take", "Undo"]) assert.match(source, new RegExp(label));
  assert.match(source, /max-h-\[90dvh\] overflow-y-auto/);
  assert.match(source, /DialogTitle/);
  assert.doesNotMatch(source, /window\.confirm/);
});
