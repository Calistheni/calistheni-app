import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import {
  isPendingPrimarySurface,
  retainLastResolvedPrimarySurface,
} from "@/lib/primary-surface-retention";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a pending parallel-route payload cannot replace a resolved primary surface", () => {
  const resolved = createElement("main", { "data-primary-tab-data": "ready" }, "Workouts 4");
  const pending = createElement("main", { "data-primary-tab-data": "pending" }, "—");
  assert.equal(isPendingPrimarySurface(pending), true);
  assert.equal(retainLastResolvedPrimarySurface(resolved, pending), resolved);
  const updated = createElement("main", { "data-primary-tab-data": "ready" }, "Workouts 5");
  assert.equal(retainLastResolvedPrimarySurface(resolved, updated), updated);
});

test("cold primary standbys use an explicit synchronization state, never fake dash values", async () => {
  const standby = await read("components/primary-tabs/PrimaryTabStandby.tsx");
  assert.doesNotMatch(standby, />—</);
  assert.doesNotMatch(standby, /— kcal|P —|C —|F —/);
  assert.match(standby, /Initial synchronization/);
});

test("primary screen activation never replaces known content with a pending standby", async () => {
  const host = await read("components/primary-tabs/PrimaryTabHost.tsx");

  assert.match(host, /const activeHref = optimisticHref \?\? committedHref/);
  assert.match(host, /retainLastResolvedPrimarySurface\(lastResolved, candidate\)/);
  assert.match(host, /data-primary-tab-host/);
  assert.match(host, /mode=\{activeHref === href \? "visible" : "hidden"\}/);
  assert.doesNotMatch(host, /Skeleton|Suspense/);
});

test("all cold primary tabs expose complete real screen structures", async () => {
  const standby = await read(
    "components/primary-tabs/PrimaryTabStandby.tsx"
  );

  for (const tab of ["home", "nutrition", "parks", "community", "rewards"]) {
    assert.match(standby, new RegExp(`data-primary-tab-shell="${tab}"`));
  }
  for (const homeSection of [
    "Weekly report",
    "Training activity",
    "Routines",
    "Recent Activity",
    "Progress Snapshot",
    "Explore",
  ]) {
    assert.match(standby, new RegExp(homeSection));
  }
  for (const nutritionRegion of [
    "Nutrition date navigation",
    "Nutrition goal",
    "Breakfast",
    "Lunch",
    "Dinner",
    "Snacks",
  ]) {
    assert.match(standby, new RegExp(nutritionRegion));
  }
  for (const rewardsRegion of [
    "Points overview",
    "Reward previews",
    "How rewards will work",
    "Pro reward benefits",
  ]) {
    assert.match(standby, new RegExp(rewardsRegion));
  }
  assert.doesNotMatch(standby, /Skeleton|animate-pulse/);
});

test("successful primary screens and client state survive tab switches", async () => {
  const [host, nutrition] = await Promise.all([
    read("components/primary-tabs/PrimaryTabHost.tsx"),
    read("components/nutrition/NutritionTracker.tsx"),
  ]);

  assert.match(host, /<Activity key=\{key\}/);
  assert.match(host, /<RetainedPrimarySurface candidate=\{surfaces\[key\]\}/);
  assert.doesNotMatch(host, /key=\{activeHref\}/);
  assert.match(nutrition, /dayCache = useRef\(new Map/);
  assert.match(nutrition, /const cached = dayCache\.current\.get\(dateKey\)/);
  assert.match(nutrition, /setEntries\(cached\?\.entries \?\? \[\]\)/);
});

test("primary data revalidation preserves the screen instead of restoring loading UI", async () => {
  const nutrition = await read("components/nutrition/NutritionTracker.tsx");

  assert.match(nutrition, /dataAvailable=\{hasSelectedDateData\}/);
  assert.doesNotMatch(nutrition, /setLoading\(|setEntries\(\[\]\)/);
  assert.doesNotMatch(nutrition, /NutritionSectionSkeleton/);
  assert.doesNotMatch(nutrition, /showInitialLoading/);
});

test("primary loading boundaries render application shells without page skeletons", async () => {
  const loadingFiles = await Promise.all(
    ["home/home", "nutrition/nutrition", "parks/parks", "community/feed", "rewards/rewards"].map(
      (route) => read(`app/(primary)/@${route}/loading.tsx`)
    )
  );

  for (const loading of loadingFiles) {
    assert.match(loading, /PrimaryTabStandby/);
    assert.doesNotMatch(loading, /Skeleton|spinner|animate-pulse/);
  }
});

test("Home and Community do not progressively stream structural regions", async () => {
  const [home, community] = await Promise.all([
    read("app/(primary)/@home/home/page.tsx"),
    read("app/(primary)/@community/feed/page.tsx"),
  ]);

  assert.match(home, /data-primary-tab-data="ready"/);
  assert.match(community, /data-primary-tab-data="ready"/);
  assert.doesNotMatch(home, /<Suspense/);
  assert.doesNotMatch(community, /<Suspense|FeedItemsLoading|<Skeleton/);
});

test("Parks remains isolated until selected and restores viewport when remounted", async () => {
  const [host, parks, map] = await Promise.all([
    read("components/primary-tabs/PrimaryTabHost.tsx"),
    read("components/HomePage.tsx"),
    read("components/ParksMap.tsx"),
  ]);

  assert.match(host, /mode=\{activeHref === href \? "visible" : "hidden"\}/);
  assert.match(parks, /dynamic\(\(\) => import\("@\/components\/ParksMap"\)/);
  assert.match(map, /readStoredParksViewport\(\)/);
  assert.match(map, /storeParksViewport\(\{/);
  assert.match(map, /map\.remove\(\)/);
});
