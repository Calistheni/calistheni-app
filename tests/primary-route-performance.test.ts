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

test("primary navigation keeps Next prefetching and warms only a small likely-route set after paint", async () => {
  const shell = await readFile(
    new URL("../components/navigation/AppShell.tsx", import.meta.url),
    "utf8"
  );

  assert.match(shell, /router\.prefetch\(href\)/);
  assert.match(shell, /window\.setTimeout/);
  assert.match(shell, /"\/home": \["\/workouts", "\/nutrition", "\/profile"\]/);
  assert.doesNotMatch(shell, /prefetch=\{false\}/);
});

test("signed-in internal navigation does not hard-reload the WebView", async () => {
  const [routineBuilder, measurementChart] = await Promise.all([
    readFile(
      new URL("../components/routines/RoutineBuilder.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../components/profile/BodyMeasurementProgressChart.tsx", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(routineBuilder, /if \(href\) router\.push\(href\)/);
  assert.doesNotMatch(routineBuilder, /window\.location\.assign\(href\)/);
  assert.match(measurementChart, /router\.push\("\/pro"\)/);
  assert.doesNotMatch(measurementChart, /window\.location\.assign\("\/pro"\)/);
});

test("Mapbox and the submit-park picker stay out of unrelated route entry paths", async () => {
  const [layout, form, picker] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/user/ParkSubmissionForm.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../components/CoordinatePicker.tsx", import.meta.url),
      "utf8"
    ),
  ]);

  assert.doesNotMatch(layout, /mapbox-gl\/dist\/mapbox-gl\.css/);
  assert.match(form, /const CoordinatePicker = dynamic/);
  assert.match(form, /ssr: false/);
  assert.match(picker, /setMapUnavailable\(true\)/);
  assert.match(picker, /Enter coordinates manually below/);
});

test("routine cards fetch only the summaries they render", async () => {
  const source = await readFile(
    new URL("../app/routines/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /_count: \{ select: \{ exercises: true \} \}/);
  assert.match(source, /routine\._count\.exercises/);
  assert.doesNotMatch(source, /include: routineInclude/);
});
