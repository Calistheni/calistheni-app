import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addNutritionDays,
  formatNutritionDateAriaLabel,
  formatNutritionMonthLabel,
  formatNutritionWeekday,
  localNutritionDateKey,
  nutritionDateFromKey,
  nutritionWeekDateKeys,
  startOfNutritionWeek,
} from "../lib/nutrition/date-navigation";

test("nutrition date keys use local calendar parts rather than UTC serialization", () => {
  const localDate = new Date(2026, 7, 8, 0, 30);
  assert.equal(localNutritionDateKey(localDate), "2026-08-08");
  assert.equal(nutritionDateFromKey("2026-08-08").getDate(), 8);
});

test("nutrition date labels use one deterministic SSR-safe locale", () => {
  const dateKey = "2026-08-03";

  assert.equal(formatNutritionDateAriaLabel(dateKey), "Monday, 3 August 2026");
  assert.equal(formatNutritionWeekday(dateKey), "Mon");
  assert.equal(formatNutritionMonthLabel(dateKey), "August 2026");
  assert.equal(formatNutritionDateAriaLabel(dateKey), formatNutritionDateAriaLabel(dateKey));
});

test("weekly navigation is Monday through Sunday and preserves weekday when moving weeks", () => {
  assert.equal(startOfNutritionWeek("2026-08-08"), "2026-08-03");
  assert.deepEqual(nutritionWeekDateKeys("2026-08-08"), [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ]);
  assert.equal(addNutritionDays("2026-08-08", -7), "2026-08-01");
  assert.equal(addNutritionDays("2026-08-08", 7), "2026-08-15");
});

test("local week arithmetic remains calendar-safe over daylight-saving boundaries", () => {
  assert.equal(addNutritionDays("2026-03-29", 7), "2026-04-05");
  assert.equal(addNutritionDays("2026-10-25", 7), "2026-11-01");
});

test("date navigator uses shadcn Calendar and accessible week controls", async () => {
  const source = await readFile(
    new URL("../components/nutrition/NutritionDateNavigator.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /<Calendar/);
  assert.match(source, /locale=\{enGB\}/);
  assert.match(source, /<Popover/);
  assert.match(source, /aria-label="Previous week"/);
  assert.match(source, /aria-label="Next week"/);
  assert.match(source, /aria-label="Open calendar"/);
  assert.match(source, /aria-label="Go to today"/);
  assert.match(source, /aria-current=\{selected \? "date" : undefined\}/);
  assert.match(source, /addNutritionDays\(selectedDate, -7\)/);
  assert.match(source, /addNutritionDays\(selectedDate, 7\)/);
  assert.doesNotMatch(source, /Intl\.DateTimeFormat\(undefined/);
  assert.doesNotMatch(source, /toLocaleDateString\(undefined/);
});

test("nutrition date helpers do not rely on the server or browser default locale", async () => {
  const source = await readFile(
    new URL("../lib/nutrition/date-navigation.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /NUTRITION_DATE_LOCALE = "en-GB"/);
  assert.doesNotMatch(source, /Intl\.DateTimeFormat\(undefined/);
  assert.doesNotMatch(source, /toLocaleDateString\(undefined/);
});

test("nutrition refreshes server-backed data on entry, mutation, and app foreground", async () => {
  const [tracker, route] = await Promise.all([
    readFile(
      new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../app/api/user/nutrition/route.ts", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(tracker, /const refreshNutritionDay = useCallback/);
  assert.match(tracker, /cache: "no-store"/);
  assert.match(tracker, /void refreshNutritionDay\(date\)/);
  assert.match(tracker, /void refreshNutritionDay\(selectedDateRef\.current\)/);
  assert.match(tracker, /App\.addListener\("appStateChange"/);
  assert.match(tracker, /document\.addEventListener\("visibilitychange"/);
  assert.match(tracker, /onAddEntries=\{applyServerEntries\}/);
  assert.match(tracker, /Future days are available to view/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /Cache-Control": "private, no-store, max-age=0"/);
});
