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

test("every primary route has immediate, layout-matched feedback", async () => {
  const [home, nutrition, parks, community, rewards] = await Promise.all([
    readFile(new URL("../app/home/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/parks/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/feed/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/rewards/loading.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /Loading home/);
  assert.match(nutrition, /Loading nutrition/);
  assert.match(parks, /Loading parks/);
  assert.match(community, /Loading community/);
  assert.match(rewards, /Loading rewards/);
});

test("primary navigation warms all five tab routes exactly once after paint", async () => {
  const [shell, navigation] = await Promise.all([
    readFile(
      new URL("../components/navigation/AppShell.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../lib/navigation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /router\.prefetch\(href\)/);
  assert.match(shell, /prefetchedPrimaryTabs\.current/);
  assert.match(shell, /for \(const href of primaryTabHrefs\)/);
  assert.match(navigation, /export const primaryTabNavigation/);
  for (const href of ["/home", "/nutrition", "/parks", "/feed", "/rewards"]) {
    assert.match(navigation, new RegExp(`href: "${href}"`));
  }
  assert.doesNotMatch(shell, /prefetch=\{false\}/);
});

test("primary tab intent gets immediate feedback and development timing", async () => {
  const shell = await readFile(
    new URL("../components/navigation/AppShell.tsx", import.meta.url),
    "utf8"
  );

  assert.match(shell, /setPendingHref\(href\)/);
  assert.match(shell, /active:scale-\[0\.96\]/);
  assert.match(shell, /\[NavigationTiming\]/);
  assert.match(shell, /process\.env\.NODE_ENV === "production"/);
  assert.doesNotMatch(shell, /window\.location|location\.href/);
});

test("Parks renders its shell without a duplicate session gate and restores map viewport", async () => {
  const [page, map] = await Promise.all([
    readFile(new URL("../app/parks/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ParksMap.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /await auth\(\)/);
  assert.match(page, /<HomePage user=\{undefined\}/);
  assert.match(map, /PARKS_VIEWPORT_STORAGE_KEY/);
  assert.match(map, /readStoredParksViewport\(\)/);
  assert.match(map, /storeParksViewport\(\{/);
});

test("Community streams feed data behind its visible route shell", async () => {
  const feed = await readFile(
    new URL("../app/feed/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(feed, /<CommunityTabs active="feed" \/>/);
  assert.match(feed, /<Suspense fallback=\{<FeedItemsLoading \/>\}>/);
  assert.match(feed, /<FeedItems userId=\{session\.user\.id\} \/>/);
});

test("primary server routes reuse one request-scoped session lookup", async () => {
  const [sessionHelper, ...routes] = await Promise.all([
    readFile(new URL("../lib/server-session.ts", import.meta.url), "utf8"),
    ...["layout", "home/page", "nutrition/page", "feed/page", "rewards/page"].map(
      (route) =>
        readFile(new URL(`../app/${route}.tsx`, import.meta.url), "utf8")
    ),
  ]);

  assert.match(sessionHelper, /cache\(\(\) => auth\(\)\)/);
  for (const route of routes) {
    assert.match(route, /getServerSession\(\)/);
    assert.doesNotMatch(route, /await auth\(\)/);
  }
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
  assert.match(form, /LoaderCircle className="size-4 animate-spin"/);
  assert.match(form, /isSubmitting \|\| isPreparingSubmission/);
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
