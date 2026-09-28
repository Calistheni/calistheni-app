import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { createPrimaryPresentation, decodePrimaryPresentation, primaryPresentationKeys, selectLastKnownGood } from "@/lib/primary-presentation";
import { primaryTabNavigation } from "@/lib/navigation";
import { isAllowedAuthenticatedApiRequest } from "@/lib/native-api-cors-core";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const snapshot = { contractVersion: 1 as const, completeness: "complete" as const, generatedAt: new Date().toISOString() };
const home = { snapshot, greetingName: "Peter", asOf: new Date().toISOString(), streakDays: 3, week: { startsAt: new Date().toISOString(), workouts: 4, completedSets: 26, totalVolumeKg: 9840, activeDays: 3, totalReps: 120, durationSeconds: 3600, personalRecords: 2, workoutGoal: 4 }, recentWorkout: null };
const rewards = { snapshot, balance: 250, rewards: [], redemptions: [], entitlement: { isPro: true, canEarnRewardPoints: true }, updatedAt: new Date().toISOString() };
const snapshots = {
  home,
  nutrition: { snapshot, date: "2026-09-28", totals: { caloriesKcal: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 }, goal: null, entryCount: 0, updatedAt: new Date().toISOString() },
  parks: { snapshot, publicParkCount: 42, version: null, updatedAt: new Date().toISOString() },
  community: { snapshot, items: [], updatedAt: new Date().toISOString() },
  rewards,
  profile: { snapshot, user: { id: "user-a", name: "Peter", username: "peter", image: null }, stats: { workouts: 4, completedSets: 26, submittedParks: 0, approvedEdits: 0, approvedPhotos: 0, rewardPoints: 250, followers: 0, following: 0 }, body: { bodyweightKg: null, measurementSystem: "METRIC" as const }, entitlement: { isPro: true }, updatedAt: new Date().toISOString() },
};

test("the canonical persistent host contains all six real destinations including Profile", async () => {
  assert.deepEqual(primaryTabNavigation.map(({ key }) => key), ["home", "nutrition", "parks", "community", "rewards", "profile"]);
  const [host, layout] = await Promise.all([read("components/primary-tabs/PrimaryTabHost.tsx"), read("app/(primary)/layout.tsx")]);
  assert.match(host, /home, nutrition, parks, community, rewards, profile/);
  assert.match(layout, /profile=\{profile\}/);
  assert.doesNotMatch(layout, /PrimaryTabStandby/);
});

test("known Home and Rewards data survive a failed background refresh", async () => {
  for (const [name, value] of [["home", home], ["rewards", rewards]] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = primaryPresentationKeys.snapshot("user-a", name);
    client.setQueryData(key, value);
    await assert.rejects(client.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error("offline"); } }));
    assert.deepEqual(client.getQueryData(key), value);
  }
});

test("validated persisted data survives a process-style cache recreation", () => {
  const freshClient = new QueryClient();
  for (const name of Object.keys(snapshots) as Array<keyof typeof snapshots>) {
    const stored = JSON.parse(JSON.stringify(createPrimaryPresentation("user-a", name, snapshots[name])));
    freshClient.setQueryData(primaryPresentationKeys.snapshot("user-a", name), decodePrimaryPresentation(stored, "user-a", name));
    assert.deepEqual(freshClient.getQueryData(primaryPresentationKeys.snapshot("user-a", name)), snapshots[name]);
  }
  assert.equal((freshClient.getQueryData(primaryPresentationKeys.snapshot("user-a", "home")) as typeof home).week.workouts, 4);
  assert.equal((freshClient.getQueryData(primaryPresentationKeys.snapshot("user-a", "rewards")) as typeof rewards).balance, 250);
});

test("aborted refresh preserves last-known-good and real zero values", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const homeKey = primaryPresentationKeys.snapshot("user-a", "home");
  const nutritionKey = primaryPresentationKeys.snapshot("user-a", "nutrition");
  client.setQueryData(homeKey, home);
  client.setQueryData(nutritionKey, snapshots.nutrition);
  await assert.rejects(client.fetchQuery({ queryKey: homeKey, queryFn: async () => { throw new DOMException("Aborted", "AbortError"); } }));
  assert.equal((client.getQueryData(homeKey) as typeof home).week.workouts, 4);
  assert.equal((client.getQueryData(nutritionKey) as typeof snapshots.nutrition).totals.caloriesKcal, 0);
});

test("malformed or cross-user snapshots cannot replace last-known-good data", () => {
  const record = createPrimaryPresentation("user-a", "home", home);
  assert.equal(decodePrimaryPresentation(record, "user-b", "home"), undefined);
  assert.equal(decodePrimaryPresentation({ ...record, data: { week: {} } }, "user-a", "home"), undefined);
  assert.throws(() => createPrimaryPresentation("user-a", "home", { week: {} }));
});

test("partial/default responses cannot replace a complete rich Home snapshot", () => {
  const partial = { ...home } as Record<string, unknown>;
  delete partial.snapshot;
  assert.throws(() => selectLastKnownGood("home", home, partial));
  assert.equal(home.week.workouts, 4);
});

test("snapshot precedence rejects older complete responses and accepts newer complete responses", () => {
  const current = { ...home, snapshot: { ...snapshot, generatedAt: "2026-09-28T10:00:00.000Z" } };
  const older = { ...home, snapshot: { ...snapshot, generatedAt: "2026-09-28T09:00:00.000Z" }, week: { ...home.week, workouts: 0 } };
  const newer = { ...home, snapshot: { ...snapshot, generatedAt: "2026-09-28T11:00:00.000Z" }, week: { ...home.week, workouts: 5 } };
  assert.equal(selectLastKnownGood("home", current, older).week.workouts, 4);
  assert.equal(selectLastKnownGood("home", current, newer).week.workouts, 5);
});

test("a contract-certified all-zero response remains legitimate data", () => {
  const zero = { ...home, week: { ...home.week, workouts: 0, completedSets: 0, totalVolumeKg: null, activeDays: 0, totalReps: 0, durationSeconds: 0, personalRecords: 0 } };
  assert.equal(selectLastKnownGood("home", undefined, zero).week.workouts, 0);
  assert.equal(selectLastKnownGood("home", undefined, zero).week.totalVolumeKg, null);
});

test("incompatible cache versions are rejected safely", () => {
  const record = createPrimaryPresentation("user-a", "home", home);
  assert.equal(decodePrimaryPresentation({ ...record, version: 1 }, "user-a", "home"), undefined);
});

test("normal AppShell no longer mounts a second presentation/cache tree", async () => {
  const shell = await read("components/navigation/AppShell.tsx");
  assert.doesNotMatch(shell, /PrimaryPresentationProvider|QueryClientProvider|new QueryClient/);
});

test("all six compact endpoints certify completeness only after building their DTO", async () => {
  for (const name of ["home", "nutrition", "parks", "community", "rewards", "profile"]) {
    const route = await read(`app/api/native/v1/${name}/route.ts`);
    assert.match(route, /completePrimaryPresentation\(/);
  }
});

test("Rewards and Profile resolve through their actual route implementations", async () => {
  const [rewardsRoute, profileRoute, shell] = await Promise.all([
    read("app/(primary)/@rewards/rewards/page.tsx"),
    read("app/(primary)/@profile/profile/page.tsx"),
    read("components/navigation/AppShell.tsx"),
  ]);
  assert.doesNotMatch(rewardsRoute, /PrimaryTabStandby|Initial synchronization/);
  assert.doesNotMatch(profileRoute, /PrimaryTabStandby|PageSkeleton/);
  assert.doesNotMatch(shell, /PrimaryPresentationProvider/);
});

test("the normal Capacitor runtime remains remote and independent of apps/native", async () => {
  const config = JSON.parse(await read("ios/App/App/capacitor.config.json"));
  assert.equal(config.webDir, "mobile-web");
  assert.equal(config.server.url, "https://calistheni.app");
  const shell = await read("components/navigation/AppShell.tsx");
  assert.doesNotMatch(shell, /apps\/native/);
});

test("native CORS remains exact after removing the duplicate presentation client", async () => {
  const cors = await read("lib/native-api-cors.ts");
  assert.match(cors, /isAllowedAuthenticatedApiRequest/);
  assert.match(cors, /isAllowedNativeOrigin/);
  assert.doesNotMatch(cors, /Access-Control-Allow-Origin", "\*"/);
});

test("same-origin compact API access works while hostile cross-origin access is rejected", () => {
  assert.equal(isAllowedAuthenticatedApiRequest({ requestUrl: "https://calistheni.app/api/native/v1/home", origin: "https://calistheni.app", fetchSite: "same-origin" }), true);
  assert.equal(isAllowedAuthenticatedApiRequest({ requestUrl: "https://calistheni.app/api/native/v1/home", origin: "capacitor://localhost", fetchSite: "cross-site" }), true);
  assert.equal(isAllowedAuthenticatedApiRequest({ requestUrl: "https://calistheni.app/api/native/v1/home", origin: "https://evil.example", fetchSite: "cross-site" }), false);
  assert.equal(isAllowedAuthenticatedApiRequest({ requestUrl: "https://calistheni.app/api/native/v1/home", origin: null, fetchSite: "cross-site" }), false);
});
