import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Home streams optional report generation instead of awaiting it before dashboard queries", async () => {
  const [home, announcement] = await Promise.all([
    readFile(new URL("../app/home/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../components/home/HomeWeeklyReportAnnouncement.tsx",
        import.meta.url
      ),
      "utf8"
    ),
  ]);
  assert.match(home, /<Suspense fallback=\{null\}>/);
  assert.match(
    home,
    /<HomeWeeklyReportAnnouncement userId=\{session\.user\.id\} \/>/
  );
  assert.doesNotMatch(home, /await generatePreviousWeeklyReport/);
  assert.match(announcement, /await generatePreviousWeeklyReport\(userId\)/);
});

test("Nutrition only fetches saved foods after an action menu opens and mounts the picker on demand", async () => {
  const source = await readFile(
    new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /const ensureSavedFoodIds = useCallback/);
  assert.match(source, /onActionMenuOpen=\{ensureSavedFoodIds\}/);
  assert.match(source, /if \(savedFoodsLoaded\.current\) return/);
  assert.match(source, /\{meal \? \(/);
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{\s*void fetch\("\/api\/nutrition\/saved-foods"/
  );
});

test("primary route loading states provide immediate, layout-matched feedback", async () => {
  const [home, nutrition] = await Promise.all([
    readFile(new URL("../app/home/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/loading.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /Loading home/);
  assert.match(nutrition, /Loading nutrition/);
});
