import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { createPrimaryPresentation, decodePrimaryPresentation, primaryPresentationKeys } from "@/lib/primary-presentation";
import { primaryTabNavigation } from "@/lib/navigation";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const home = { greetingName: "Peter", asOf: new Date().toISOString(), streakDays: 3, week: { startsAt: new Date().toISOString(), workouts: 4, completedSets: 26, totalVolumeKg: 9840, activeDays: 3, totalReps: 120, durationSeconds: 3600, personalRecords: 2, workoutGoal: 4 }, recentWorkout: null };
const rewards = { balance: 250, rewards: [], redemptions: [], entitlement: { isPro: true, canEarnRewardPoints: true }, updatedAt: new Date().toISOString() };
const snapshots = {
  home,
  nutrition: { date: "2026-09-28", totals: { caloriesKcal: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 }, goal: null, entryCount: 0, updatedAt: new Date().toISOString() },
  parks: { publicParkCount: 42, version: null, updatedAt: new Date().toISOString() },
  community: { items: [], updatedAt: new Date().toISOString() },
  rewards,
  profile: { user: { id: "user-a", name: "Peter", username: "peter", image: null }, stats: { workouts: 4, completedSets: 26, submittedParks: 0, approvedEdits: 0, approvedPhotos: 0, rewardPoints: 250, followers: 0, following: 0 }, body: { bodyweightKg: null, measurementSystem: "METRIC" as const }, entitlement: { isPro: true }, updatedAt: new Date().toISOString() },
};

test("the canonical persistent host contains all six destinations including Profile", async () => {
  assert.deepEqual(primaryTabNavigation.map(({ key }) => key), ["home", "nutrition", "parks", "community", "rewards", "profile"]);
  const [host, layout] = await Promise.all([read("components/primary-tabs/PrimaryTabHost.tsx"), read("app/(primary)/layout.tsx")]);
  assert.match(host, /home, nutrition, parks, community, rewards, profile/);
  assert.match(layout, /profile=\{<PrimaryTabStandby tab="profile" \/>\}/);
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

test("normal root provider has one stable QueryClient and persists only validated success", async () => {
  const provider = await read("components/primary-tabs/PrimaryPresentationProvider.tsx");
  assert.match(provider, /useState\(\(\) => new QueryClient/);
  assert.doesNotMatch(provider, /key=\{pathname\}|removeQueries|resetQueries|queryClient\.clear/);
  assert.match(provider, /primarySchemas\[name\]\.parse\(await response\.json\(\)\)/);
  assert.match(provider, /if \(!response\.ok\) throw/);
  assert.match(provider, /persistPrimaryPresentation\(userId, name, parsed\)/);
  assert.ok(provider.indexOf("queryClient.setQueryData") < provider.indexOf("setHydrated(true)"));
});

test("returning Rewards/Profile render cached data even while fetching", async () => {
  const standby = await read("components/primary-tabs/PrimaryTabStandby.tsx");
  assert.doesNotMatch(standby, /isFetching\s*\?|isLoading\s*\?|Initial synchronization|Partner rewards are preparing|PageSkeleton/);
  assert.match(standby, /if \(data\) return <main data-primary-tab-shell="rewards" data-primary-tab-data="ready"/);
  assert.match(standby, /data-primary-tab-shell="profile" data-primary-tab-data="ready"/);
  assert.match(standby, /data\.balance\.toLocaleString\(\)/);
});

test("the normal Capacitor runtime remains remote and independent of apps/native", async () => {
  const config = JSON.parse(await read("ios/App/App/capacitor.config.json"));
  assert.equal(config.webDir, "mobile-web");
  assert.equal(config.server.url, "https://calistheni.app");
  const provider = await read("components/primary-tabs/PrimaryPresentationProvider.tsx");
  assert.doesNotMatch(provider, /apps\/native/);
});

test("normal presentation refreshes are same-origin cookie requests while native CORS stays exact", async () => {
  const [provider, cors] = await Promise.all([read("components/primary-tabs/PrimaryPresentationProvider.tsx"), read("lib/native-api-cors.ts")]);
  assert.match(provider, /credentials: "same-origin"/);
  assert.match(cors, /origin === new URL\(request\.url\)\.origin/);
  assert.match(cors, /isAllowedNativeOrigin/);
  assert.doesNotMatch(cors, /Access-Control-Allow-Origin", "\*"/);
});
