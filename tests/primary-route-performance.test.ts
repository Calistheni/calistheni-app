import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Home holds its complete route behind one coherent standby screen", async () => {
  const [home, announcement] = await Promise.all([
    readFile(new URL("../app/(primary)/@home/home/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../components/home/HomeWeeklyReportAnnouncement.tsx",
        import.meta.url
      ),
      "utf8"
    ),
  ]);
  assert.match(
    home,
    /<HomeWeeklyReportAnnouncement userId=\{session\.user\.id\} \/>/
  );
  assert.doesNotMatch(home, /<Suspense/);
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
  assert.match(source, /setLoadedDate\(dateKey\)/);
  assert.match(source, /dayCache\.current\.set\(dateKey/);
  assert.match(source, /const hasSelectedDateData = loadedDate === date/);
  assert.doesNotMatch(source, /NutritionSectionSkeleton/);
});

test("primary route boundaries render real standby shells instead of skeletons", async () => {
  const loadingFiles = await Promise.all([
    readFile(new URL("../app/(primary)/@home/home/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@nutrition/nutrition/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@parks/parks/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@community/feed/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@rewards/rewards/loading.tsx", import.meta.url), "utf8"),
  ]);
  for (const loading of loadingFiles) {
    assert.match(loading, /PrimaryTabStandby/);
    assert.doesNotMatch(loading, /Skeleton|animate-pulse/);
  }
});

test("parallel primary slots retain visited tabs and reveal intent immediately", async () => {
  const [layout, slots, context, standby] = await Promise.all([
    readFile(new URL("../app/(primary)/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/primary-tabs/PrimaryTabHost.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/navigation/AppShellContext.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/primary-tabs/PrimaryTabStandby.tsx", import.meta.url), "utf8"),
  ]);

  for (const slot of ["home", "nutrition", "parks", "community", "rewards"]) {
    assert.match(layout, new RegExp(`${slot}: React\\.ReactNode`));
    assert.match(standby, new RegExp(`data-primary-tab-shell="${slot}"`));
  }
  assert.match(slots, /data-primary-tab-host/);
  assert.match(slots, /import \{ Activity/);
  assert.match(slots, /mode=\{activeHref === href \? "visible" : "hidden"\}/);
  assert.match(slots, /usePrimaryTabNavigationTarget\(\)/);
  assert.match(context, /PrimaryTabNavigationTargetProvider/);
});

test("idle and lifecycle refreshes cannot choose a primary route", async () => {
  const [shell, nativeShell, entry, navigation] = await Promise.all([
    readFile(
      new URL("../components/navigation/AppShell.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../components/native/NativeShell.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/navigation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /getPrimaryTabCookieValue\(pathname\)/);
  assert.match(entry, /getPrimaryTabHrefFromCookie/);
  assert.match(navigation, /PRIMARY_TAB_COOKIE_NAME/);
  assert.doesNotMatch(nativeShell, /router\.(push|replace|refresh)/);
  assert.doesNotMatch(shell, /router\.(push|replace)\("\/home"\)/);
  assert.doesNotMatch(shell, /setTimeout\([^)]*router\.refresh/);
});

test("primary navigation warms all six destinations exactly once after paint", async () => {
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

  assert.match(shell, /beginNavigationIntent\(href\)/);
  assert.match(shell, /settlePrimaryNavigationIntent\(/);
  assert.match(shell, /active:scale-\[0\.96\]/);
  assert.match(shell, /\[NavigationTiming\]/);
  assert.match(shell, /process\.env\.NODE_ENV === "production"/);
  assert.doesNotMatch(shell, /window\.location|location\.href/);
});

test("Parks renders its shell without a duplicate session gate and restores map viewport", async () => {
  const [page, map] = await Promise.all([
    readFile(new URL("../app/(primary)/@parks/parks/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ParksMap.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /await auth\(\)/);
  assert.match(page, /<HomePage user=\{undefined\}/);
  assert.match(map, /PARKS_VIEWPORT_STORAGE_KEY/);
  assert.match(map, /readStoredParksViewport\(\)/);
  assert.match(map, /storeParksViewport\(\{/);
});

test("Community keeps the standby screen until the complete feed is ready", async () => {
  const feed = await readFile(
    new URL("../app/(primary)/@community/feed/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(feed, /<CommunityTabs active="feed" \/>/);
  assert.match(feed, /<FeedItems userId=\{session\.user\.id\} \/>/);
  assert.doesNotMatch(feed, /Suspense|FeedItemsLoading|<Skeleton/);
});

test("primary server routes reuse one request-scoped session lookup", async () => {
  const [sessionHelper, ...routes] = await Promise.all([
    readFile(new URL("../lib/server-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@home/home/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@nutrition/nutrition/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@community/feed/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(primary)/@rewards/rewards/page.tsx", import.meta.url), "utf8"),
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
