import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  ensurePrimaryQueriesReady,
  missingPrimaryQueries,
  nativePrimaryQueryNames,
  primaryQueryKey,
  revalidatePrimaryQueries,
  seedHydratedPrimarySnapshot,
  validatePrimaryData,
  type NativePrimaryDataMap,
  type NativePrimaryFetcher,
  type NativePrimaryQueryName,
} from "../apps/native/lib/primary-data";
import { createPrimarySnapshotRecord, decodePrimarySnapshotRecord } from "../apps/native/lib/cache";
import { getNativeQueryClient } from "../apps/native/lib/query-client";

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
  assert.match(cache, /record\.userId !== userId/);
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
  assert.match(home, /query\.isFetching/);
  assert.doesNotMatch(home, /data\?\.[^\n]+\?\? ["']—["']/);
});

test("Home uses one coherent dashboard DTO rather than independent section requests", () => {
  const surface = read("apps/native/components/NativeHomeSurface.tsx");
  const route = read("app/api/native/v1/home/route.ts");
  assert.equal((surface.match(/usePrimarySnapshot\(/g) ?? []).length, 1);
  assert.match(surface, /usePrimarySnapshot\(userId, "home", active\)/);
  assert.match(route, /week: \{[\s\S]*workouts:[\s\S]*completedSets:[\s\S]*totalVolumeKg:[\s\S]*activeDays:/);
  assert.match(route, /Promise\.all/);
});

test("required first-paint synchronization runs before ready and never activates Mapbox", () => {
  const primary = read("apps/native/lib/primary-data.ts");
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  const ensure = provider.indexOf("await ensurePrimaryQueriesReady(queryClient, cached.user.id)");
  const ready = provider.indexOf('setState({ status: "authenticated", bootstrap: cached');
  assert.ok(ensure >= 0 && ready > ensure);
  assert.match(primary, /const missing = missingPrimaryQueries/);
  assert.match(primary, /await Promise\.all\(/);
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
    ["NativeProfileSurface", "profile"],
  ]) {
    assert.match(host, new RegExp(`<${component} active=\\{active\\}`));
    const source = read(`apps/native/components/${component}.tsx`);
    assert.match(source, new RegExp(`usePrimarySnapshot\\(userId, "${name}", active`));
    assert.doesNotMatch(source, /Skeleton|Suspense|removeQueries|resetQueries/);
  }
});

const primaryFixtures: NativePrimaryDataMap = {
  home: { greetingName: "Peter", asOf: "now", streakDays: 2, week: { startsAt: "now", workouts: 0, completedSets: 0, totalVolumeKg: 0, activeDays: 0, totalReps: 0, durationSeconds: 0, personalRecords: 0, workoutGoal: 3 }, recentWorkout: null },
  nutrition: { date: "2026-09-27", totals: { caloriesKcal: 0 }, goal: null, entryCount: 0, updatedAt: "now" },
  parks: { publicParkCount: 0, version: null, updatedAt: "now" },
  community: { items: [], updatedAt: "now" },
  rewards: { balance: 0, rewards: [], redemptions: [], entitlement: { isPro: true, canEarnRewardPoints: true }, updatedAt: "now" },
  profile: { user: { id: "user-1", name: "Peter", username: "peter", image: null }, stats: { workouts: 0, completedSets: 0, submittedParks: 0, approvedEdits: 0, approvedPhotos: 0, rewardPoints: 0, followers: 0, following: 0 }, body: { bodyweightKg: null, measurementSystem: "METRIC" }, entitlement: { isPro: true }, updatedAt: "now" },
};

function fixtureFetcher(calls: NativePrimaryQueryName[]): NativePrimaryFetcher {
  return async <Name extends NativePrimaryQueryName>(_userId: string, name: Name) => {
    calls.push(name);
    return primaryFixtures[name] as NativePrimaryDataMap[Name];
  };
}

test("fresh authenticated startup seeds all six exact screen query keys before first activation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls: NativePrimaryQueryName[] = [];
  await ensurePrimaryQueriesReady(client, "user-1", "2026-09-27", fixtureFetcher(calls));
  assert.deepEqual(new Set(calls), new Set(nativePrimaryQueryNames));
  for (const name of ["home", "nutrition", "community", "parks", "rewards", "profile"] as const) {
    assert.deepEqual(client.getQueryData(primaryQueryKey("user-1", name, "2026-09-27")), primaryFixtures[name]);
  }
  assert.deepEqual(missingPrimaryQueries(client, "user-1", "2026-09-27"), []);
});

test("returning-user snapshots satisfy readiness without a required network response", async () => {
  const client = new QueryClient();
  for (const name of nativePrimaryQueryNames) client.setQueryData(primaryQueryKey("user-1", name, "2026-09-27"), primaryFixtures[name]);
  const calls: NativePrimaryQueryName[] = [];
  await ensurePrimaryQueriesReady(client, "user-1", "2026-09-27", fixtureFetcher(calls));
  assert.deepEqual(calls, []);
});

test("failed background revalidation retains all known primary values", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const name of nativePrimaryQueryNames) client.setQueryData(primaryQueryKey("user-1", name, "2026-09-27"), primaryFixtures[name]);
  const failing = (async () => { throw new Error("offline"); }) as NativePrimaryFetcher;
  await revalidatePrimaryQueries(client, "user-1", "2026-09-27", failing);
  for (const name of nativePrimaryQueryNames) assert.deepEqual(client.getQueryData(primaryQueryKey("user-1", name, "2026-09-27")), primaryFixtures[name]);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((success) => { resolve = success; });
  return { promise, resolve };
}

test("real Home survives navigation and an in-flight refresh, then updates atomically", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const key = primaryQueryKey("home-transition-user", "home", "2026-09-27");
  const oldHome = { ...primaryFixtures.home, week: { ...primaryFixtures.home.week, workouts: 4, completedSets: 26, activeDays: 3 } };
  const newHome = { ...oldHome, week: { ...oldHome.week, workouts: 5, completedSets: 31, activeDays: 4 } };
  client.setQueryData(key, oldHome);
  const firstObserver = new QueryObserver(client, { queryKey: key, queryFn: async () => oldHome, enabled: false });
  const leaveHome = firstObserver.subscribe(() => undefined);
  assert.equal(firstObserver.getCurrentResult().data?.week.workouts, 4);
  leaveHome();
  const refresh = deferred<typeof newHome>();
  const request = client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: () => refresh.promise });
  const returningObserver = new QueryObserver(client, { queryKey: key, queryFn: () => refresh.promise, enabled: false });
  const leaveAgain = returningObserver.subscribe(() => undefined);
  assert.equal(returningObserver.getCurrentResult().data?.week.workouts, 4);
  assert.equal(returningObserver.getCurrentResult().data?.week.activeDays, 3);
  refresh.resolve(newHome);
  await request;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(returningObserver.getCurrentResult().data?.week.workouts, 5);
  assert.equal(returningObserver.getCurrentResult().data?.week.activeDays, 4);
  leaveAgain();
});

test("real Rewards survives navigation and an in-flight or failed refresh", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const key = primaryQueryKey("reward-transition-user", "rewards", "2026-09-27");
  const oldRewards = { ...primaryFixtures.rewards, balance: 120 };
  const nextRewards = { ...oldRewards, balance: 155 };
  client.setQueryData(key, oldRewards);
  const pending = deferred<typeof nextRewards>();
  const request = client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: () => pending.promise });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: () => pending.promise });
  const stop = observer.subscribe(() => undefined);
  assert.equal(observer.getCurrentResult().data?.balance, 120);
  pending.resolve(nextRewards);
  await request;
  assert.equal(observer.getCurrentResult().data?.balance, 155);
  stop();
  await assert.rejects(client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: async () => { throw new Error("offline"); } }), /offline/);
  assert.equal(client.getQueryData<typeof nextRewards>(key)?.balance, 155);
});

test("hydration and invalid responses cannot overwrite a last-known-good Home snapshot", () => {
  const client = new QueryClient();
  const userId = "hydration-user";
  const key = primaryQueryKey(userId, "home", "2026-09-27");
  const current = { ...primaryFixtures.home, week: { ...primaryFixtures.home.week, workouts: 9 } };
  const older = { ...primaryFixtures.home, week: { ...primaryFixtures.home.week, workouts: 2 } };
  client.setQueryData(key, current);
  seedHydratedPrimarySnapshot(client, userId, "home", older, "2026-09-27");
  assert.equal(client.getQueryData<typeof current>(key)?.week.workouts, 9);
  assert.throws(() => validatePrimaryData("home", { week: {} }), /Invalid home snapshot/);
});

test("persisted records survive restart semantics and reject empty replacement data", () => {
  const record = createPrimarySnapshotRecord("restart-user", "home", primaryFixtures.home);
  assert.deepEqual(decodePrimarySnapshotRecord(record, "restart-user", "home"), primaryFixtures.home);
  assert.throws(() => createPrimarySnapshotRecord("restart-user", "home", undefined), /validated data/);
  assert.equal(decodePrimarySnapshotRecord({ ...record, data: undefined }, "restart-user", "home"), undefined);
});

test("the native QueryClient is one stable application-lifetime instance", () => {
  assert.equal(getNativeQueryClient(), getNativeQueryClient());
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(provider, /const queryClient = getNativeQueryClient\(\)/);
  assert.doesNotMatch(provider, /new QueryClient|key=\{pathname\}|key=\{userId/);
});

test("Profile has one local optimistic navigation owner and no skeleton route", () => {
  const host = read("apps/native/components/NativePrimaryTabHost.tsx");
  const profile = read("apps/native/components/NativeProfileSurface.tsx");
  assert.match(host, /href="\/profile"[\s\S]*onPointerDown=[\s\S]*beginIntent\("\/profile"\)/);
  assert.equal((host.match(/href="\/profile"/g) ?? []).length, 1);
  assert.doesNotMatch(host + profile, /router\.push|router\.replace|Skeleton|Suspense/);
  assert.match(profile, /usePrimarySnapshot\(userId, "profile", active\)/);
});

test("rapid Home to Profile to Nutrition keeps the latest native intent", async () => {
  const { beginNativeNavigationIntent } = await import("../apps/native/lib/navigation");
  const home = beginNativeNavigationIntent(0, "/home");
  const profile = beginNativeNavigationIntent(home.generation, "/profile");
  const nutrition = beginNativeNavigationIntent(profile.generation, "/nutrition");
  assert.equal(nutrition.generation, 3);
  assert.equal(nutrition.href, "/nutrition");
});

test("known zero values remain real zeroes and no primary statistic uses a dash as loading state", () => {
  for (const component of ["NativeHomeSurface", "NativeNutritionSurface", "NativeRewardsSurface", "NativeProfileSurface"]) {
    const source = read(`apps/native/components/${component}.tsx`);
    assert.doesNotMatch(source, /["']—["']/);
  }
  assert.equal(primaryFixtures.home.week.workouts, 0);
  assert.equal(primaryFixtures.rewards.balance, 0);
});

test("logout and confirmed unauthorized state clear user-scoped primary snapshots", () => {
  const provider = read("apps/native/components/NativeAuthProvider.tsx");
  assert.match(provider, /if \(userId\) await clearUserCache\(userId\)/);
  assert.match(provider, /clearUserCache\(cached\.user\.id\)/);
  assert.match(provider, /queryClient\.clear\(\)/);
  assert.match(provider, /forgetPrimarySnapshots\(userId\)/);
});
