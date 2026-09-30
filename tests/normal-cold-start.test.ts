import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeNutritionDay } from "@/lib/nutrition/day-presentation-cache";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("native runtime diagnostics are invisible unless explicitly opted in", async () => {
  const [controller, project, sharedScheme] = await Promise.all([
    read("ios/App/App/MainViewController.swift"),
    read("ios/App/App.xcodeproj/project.pbxproj"),
    read("ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"),
  ]);
  assert.match(controller, /#if DEBUG/);
  assert.match(
    controller,
    /environment\["CALISTHENI_RUNTIME_DIAGNOSTICS"\] == "1"/
  );
  assert.match(controller, /installRuntimeDiagnostics\(\)/);
  assert.doesNotMatch(
    project,
    /CALISTHENI_RUNTIME_DIAGNOSTICS(?:=|\\\")1/
  );
  assert.doesNotMatch(sharedScheme, /CALISTHENI_RUNTIME_DIAGNOSTICS/);
});

test("the root shell does not block first paint on the unread badge query", async () => {
  const [layout, activity, shell] = await Promise.all([
    read("app/layout.tsx"),
    read("app/api/user/activity/route.ts"),
    read("components/navigation/AppShell.tsx"),
  ]);
  assert.doesNotMatch(layout, /workoutNotification\.count/);
  assert.match(layout, /Promise\.all\(\[\s*cookies\(\),\s*getServerSession\(\)/);
  assert.match(activity, /export async function GET\(\)/);
  assert.match(activity, /workoutNotification\.count/);
  assert.match(shell, /fetch\("\/api\/user\/activity"/);
});

test("all six real routes begin prefetch without an idle delay", async () => {
  const [shell, navigation] = await Promise.all([
    read("components/navigation/AppShell.tsx"),
    read("lib/navigation.ts"),
  ]);
  assert.match(shell, /for \(const href of primaryTabHrefs\)/);
  assert.match(shell, /router\.prefetch\(href\)/);
  assert.doesNotMatch(shell, /requestIdleCallback|fallbackTimer/);
  for (const href of [
    "/home",
    "/nutrition",
    "/parks",
    "/feed",
    "/rewards",
    "/profile",
  ]) {
    assert.match(navigation, new RegExp(`href: "${href}"`));
  }
});

test("Nutrition warming hydrates the actual tracker and validates persisted data", async () => {
  const [shell, tracker, page, cache] = await Promise.all([
    read("components/navigation/AppShell.tsx"),
    read("components/nutrition/NutritionTracker.tsx"),
    read("app/(primary)/@nutrition/nutrition/page.tsx"),
    read("lib/nutrition/day-presentation-cache.ts"),
  ]);
  assert.match(shell, /warmCurrentNutritionDay\(userId\)/);
  assert.match(
    page,
    /<NutritionTracker key=\{session\.user\.id\} userId=\{session\.user\.id\} \/>/
  );
  assert.match(tracker, /readNutritionDay\(userId, initialToday\)/);
  assert.match(tracker, /refreshCachedNutritionDay\(userId, dateKey\)/);
  assert.match(cache, /calistheni:nutrition-day:v\$\{VERSION\}/);
  assert.match(cache, /record\.userId !== userId/);
  assert.match(cache, /if \(!data\) throw new Error/);

  const zero = decodeNutritionDay({
    entries: [],
    goal: {
      caloriesKcal: 0,
      proteinGrams: 0,
      carbohydrateGrams: 0,
      fatGrams: 0,
    },
  });
  assert.ok(zero);
  assert.deepEqual(zero.entries, []);
  assert.equal(decodeNutritionDay({ entries: [{ id: "partial" }] }), null);
});

test("Home and Community avoid their previous database waterfalls", async () => {
  const [home, community] = await Promise.all([
    read("app/(primary)/@home/home/page.tsx"),
    read("app/(primary)/@community/feed/page.tsx"),
  ]);
  assert.doesNotMatch(home, /redirectIfOnboardingRequired/);
  assert.match(home, /onboardingCompleted: true/);
  assert.match(home, /if \(!profile\.onboardingCompleted\) redirect\("\/onboarding"\)/);
  assert.doesNotMatch(community, /userFollow\.findMany|followingIds/);
  assert.match(community, /followers:\s*\{\s*some: \{ followerId: userId \}/);
});

test("cold-start work preserves real surfaces and does not initialize Mapbox globally", async () => {
  const [shell, host, parks] = await Promise.all([
    read("components/navigation/AppShell.tsx"),
    read("components/primary-tabs/PrimaryTabHost.tsx"),
    read("components/HomePage.tsx"),
  ]);
  assert.doesNotMatch(shell + host, /PrimaryTabStandby|PrimaryPresentationProvider/);
  assert.match(host, /selectResolvedPrimaryHref/);
  assert.match(parks, /dynamic\(\(\) => import\("@\/components\/ParksMap"\)/);
  assert.doesNotMatch(shell, /import\("@\/components\/ParksMap"\)/);
});

test("normal remote Capacitor runtime remains unchanged", async () => {
  const config = JSON.parse(await read("ios/App/App/capacitor.config.json"));
  assert.equal(config.webDir, "mobile-web");
  assert.equal(config.server.url, "https://calistheni.app");
});
