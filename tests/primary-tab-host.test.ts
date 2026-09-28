import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import {
  isPendingPrimarySurface,
  retainLastResolvedPrimarySurface,
  selectResolvedPrimaryHref,
} from "@/lib/primary-surface-retention";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const resolved = (label: string) =>
  createElement("main", { "data-primary-tab-data": "ready" }, label);
const pending = (destination: string) =>
  createElement("template", {
    "data-primary-tab-data": "pending",
    "data-primary-tab-destination": destination,
  });

test("a pending route can neither replace a resolved surface nor become active", () => {
  const home = resolved("real Home");
  const rewardsPending = pending("rewards");
  assert.equal(isPendingPrimarySurface(rewardsPending), true);
  assert.equal(retainLastResolvedPrimarySurface(home, rewardsPending), home);
  assert.equal(
    selectResolvedPrimaryHref({
      requestedHref: "/rewards",
      previousHref: "/home",
      requestedSurface: rewardsPending,
    }),
    "/home"
  );
  const rewards = resolved("real Rewards");
  assert.equal(retainLastResolvedPrimarySurface(undefined, rewards), rewards);
  assert.equal(
    selectResolvedPrimaryHref({
      requestedHref: "/rewards",
      previousHref: "/home",
      requestedSurface: rewards,
    }),
    "/rewards"
  );
});

test("all six destinations use a non-visual unmatched-slot marker", async () => {
  const marker = await read("components/primary-tabs/PrimaryRoutePending.tsx");
  assert.match(marker, /<template/);
  assert.match(marker, /data-primary-route-pending/);
  assert.doesNotMatch(
    marker,
    /Weekly report|Nutrition goal|Workout Feed|Calis Points|Card|Skeleton/
  );

  for (const destination of [
    "home",
    "nutrition",
    "parks",
    "community",
    "rewards",
    "profile",
  ]) {
    const source = await read(`app/(primary)/@${destination}/default.tsx`);
    assert.match(source, /PrimaryRoutePending/);
    assert.match(source, new RegExp(`destination="${destination}"`));
    assert.doesNotMatch(source, /PrimaryTabStandby/);
  }
});

test("duplicate primary standby implementations no longer exist", async () => {
  for (const path of [
    "components/primary-tabs/PrimaryTabStandby.tsx",
    "components/primary-tabs/PrimaryPresentationProvider.tsx",
  ]) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)));
  }
});

test("primary route activation waits for the real candidate and retains visited surfaces", async () => {
  const host = await read("components/primary-tabs/PrimaryTabHost.tsx");
  assert.match(host, /selectResolvedPrimaryHref\(\{/);
  assert.match(
    host,
    /const requestedSurface = requestedEntry \? surfaces\[requestedEntry\.key\] : null/
  );
  assert.match(
    host,
    /retainLastResolvedPrimarySurface\(lastResolved, candidate\)/
  );
  assert.match(host, /<Activity key=\{key\}/);
  assert.match(host, /mode=\{activeHref === href \? "visible" : "hidden"\}/);
  assert.doesNotMatch(host, /PrimaryTabStandby|Skeleton|Suspense/);
});

test("primary loading replicas are absent", async () => {
  for (const path of [
    "app/(primary)/@home/home/loading.tsx",
    "app/(primary)/@nutrition/nutrition/loading.tsx",
    "app/(primary)/@parks/parks/loading.tsx",
    "app/(primary)/@community/feed/loading.tsx",
    "app/(primary)/@rewards/rewards/loading.tsx",
    "app/profile/loading.tsx",
  ]) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)));
  }
});

test("all six canonical route pages are real surfaces", async () => {
  const files = {
    home: "app/(primary)/@home/home/page.tsx",
    nutrition: "app/(primary)/@nutrition/nutrition/page.tsx",
    parks: "app/(primary)/@parks/parks/page.tsx",
    community: "app/(primary)/@community/feed/page.tsx",
    rewards: "app/(primary)/@rewards/rewards/page.tsx",
    profile: "app/(primary)/@profile/profile/page.tsx",
  } as const;
  for (const path of Object.values(files)) {
    const source = await read(path);
    assert.doesNotMatch(source, /PrimaryTabStandby|PrimaryRoutePending/);
  }
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
