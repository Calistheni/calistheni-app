import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("successful Home data survives a failed background revalidation", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ["native", "primary", "user-1", "home"] as const;
  const snapshot = {
    greetingName: "Peter",
    week: { workouts: 12, completedSets: 48, totalVolumeKg: 9840, activeDays: 4 },
  };
  queryClient.setQueryData(key, snapshot);
  await assert.rejects(
    queryClient.fetchQuery({ queryKey: key, staleTime: 0, queryFn: async () => { throw new Error("offline"); } }),
    /offline/
  );
  assert.deepEqual(queryClient.getQueryData(key), snapshot);
});

test("persisted primary snapshots are versioned, user-scoped, and hydrated before tabs become ready", () => {
  const cache = read("apps/native/lib/cache.ts");
  const primary = read("apps/native/lib/primary-data.ts");
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(cache, /PRIMARY_SNAPSHOT_VERSION = 1/);
  assert.match(cache, /value\.userId !== userId/);
  assert.match(cache, /`primary:v\$\{PRIMARY_SNAPSHOT_VERSION\}:\$\{key\}`/);
  for (const name of ["home", "nutrition", "parks", "community", "rewards"]) {
    assert.match(primary, new RegExp(`"${name}"`));
  }
  assert.match(primary, /setQueryData\([\s\S]*\{ updatedAt: 0 \}/);
  const hydrate = provider.indexOf("await hydratePrimarySnapshots(queryClient, cached.user.id)");
  const ready = provider.indexOf('setState({ status: "authenticated", bootstrap: cached');
  assert.ok(hydrate >= 0 && ready > hydrate, "cache hydration must precede authenticated rendering");
});

test("tab navigation never resets primary query data", () => {
  const host = read("apps/native/components/NativePrimaryTabHost.tsx");
  const home = read("apps/native/components/NativeHomeSurface.tsx");
  assert.match(host, /<NativeHomeSurface active=\{active\}/);
  assert.doesNotMatch(host + home, /removeQueries|resetQueries|setQueryData\([^,]+,\s*undefined/);
  assert.match(home, /const data = query\.data/);
  assert.match(home, /query\.isFetching && data/);
  assert.doesNotMatch(home, /data\?\.[^\n]+\?\? ["']—["']/);
});

test("Home uses one coherent dashboard DTO rather than independent section requests", () => {
  const surface = read("apps/native/components/NativeHomeSurface.tsx");
  const route = read("app/api/native/v1/home/route.ts");
  assert.equal((surface.match(/useQuery(?:<[^>]+>)?\(\{/g) ?? []).length, 1);
  assert.match(surface, /fetchPrimarySnapshot\(userId, "home", undefined, signal\)/);
  assert.match(route, /week: \{[\s\S]*workouts:[\s\S]*completedSets:[\s\S]*totalVolumeKg:[\s\S]*activeDays:/);
  assert.match(route, /Promise\.all/);
});

test("idle warming fetches only bounded primary DTOs and never activates Mapbox", () => {
  const primary = read("apps/native/lib/primary-data.ts");
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(provider, /requestIdleCallback/);
  assert.match(primary, /queryClient\.prefetchQuery/);
  assert.match(primary, /for \(const name of backgroundNames\)/);
  assert.doesNotMatch(primary + provider, /mapbox|Mapbox|geolocation|watchPosition/);
  assert.doesNotMatch(primary, /setInterval|refetchInterval/);
});

test("all primary surfaces consume the same hydrated persistent query layer", () => {
  const host = read("apps/native/components/NativePrimaryTabHost.tsx");
  for (const [component, name] of [
    ["NativeHomeSurface", "home"],
    ["NativeNutritionSurface", "nutrition"],
    ["NativeParksSurface", "parks"],
    ["NativeCommunitySurface", "community"],
    ["NativeRewardsSurface", "rewards"],
  ]) {
    assert.match(host, new RegExp(`<${component} active=\\{active\\}`));
    const source = read(`apps/native/components/${component}.tsx`);
    assert.match(source, new RegExp(`primaryQueryKey\\(userId, "${name}"`));
    assert.match(source, new RegExp(`fetchPrimarySnapshot\\(userId, "${name}"`));
    assert.doesNotMatch(source, /Skeleton|Suspense|removeQueries|resetQueries/);
  }
});

test("logout and confirmed unauthorized state clear user-scoped primary snapshots", () => {
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(provider, /if \(userId\) await clearUserCache\(userId\)/);
  assert.match(provider, /clearUserCache\(cached\.user\.id\)/);
  assert.match(provider, /queryClient\.clear\(\)/);
});
