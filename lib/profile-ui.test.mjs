import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CALISTHENI_CHART_BLUE } from "./chart-colors.ts";

const projectRoot = new URL("../", import.meta.url);

test("profile stats use one aligned shared card without a reward star", async () => {
  const [profilePage, statCard] = await Promise.all([
    readFile(new URL("app/profile/page.tsx", projectRoot), "utf8"),
    readFile(
      new URL("components/profile/ProfileStatCard.tsx", projectRoot),
      "utf8"
    ),
  ]);

  assert.match(profilePage, /<ProfileStatCard/);
  assert.match(profilePage, /grid-cols-2.*md:grid-cols-3.*xl:grid-cols-6/);
  for (const label of [
    "Workouts",
    "Sets",
    "Parks",
    "Approved edits",
    "Approved photos",
    "Reward Points",
  ]) {
    assert.match(profilePage, new RegExp(`"${label}"`));
  }
  assert.match(profilePage, /\["Reward Points",/);
  assert.doesNotMatch(profilePage, /⭐\s*Reward Points/);
  assert.match(statCard, /min-h-8/);
  assert.match(statCard, /leading-none tabular-nums/);
});

test("muscle radar uses the semantic Calistheni blue token", async () => {
  const radar = await readFile(
    new URL("components/profile/MuscleActivityRadar.tsx", projectRoot),
    "utf8"
  );

  assert.equal(CALISTHENI_CHART_BLUE, "var(--primary)");
  assert.match(radar, /stroke="var\(--color-workloadSets\)"/);
  assert.match(radar, /fill="var\(--color-workloadSets\)"/);
  assert.match(radar, /fillOpacity=\{0\.28\}/);
  assert.match(radar, /stroke="var\(--border\)"/);
  assert.match(radar, /var\(--muted-foreground\)/);
  assert.match(radar, /activeDot=\{false\}/);
  assert.match(radar, /dot=\{false\}/);
  assert.match(radar, /pointerEvents="none"/);
  assert.match(radar, /items-center justify-between gap-4/);
  assert.match(radar, /tabular-nums/);
  assert.match(radar, /role="button"/);
  assert.match(radar, /touch-pan-y/);
  assert.doesNotMatch(radar, /#000(?:000)?|fill="black"|stroke="black"/i);
});

test("mobile navigation is one equal-width row with safe-area spacing", async () => {
  const [globals, appShell] = await Promise.all([
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(
      new URL("components/navigation/AppShell.tsx", projectRoot),
      "utf8"
    ),
  ]);

  assert.match(globals, /\.app-mobile-nav-grid\s*\{[^}]*display:\s*flex/s);
  assert.match(globals, /flex-flow:\s*row nowrap/);
  assert.match(globals, /\.app-mobile-nav-grid\s*\{[^}]*width:\s*100%/s);
  assert.match(globals, /\.app-mobile-nav-grid\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(globals, /padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  assert.match(globals, /max-width:\s*100vw/);
  assert.match(globals, /overflow-x:\s*clip/);
  assert.match(appShell, /flex w-full flex-nowrap items-stretch overflow-hidden/);
  assert.match(appShell, /min-w-0 flex-1 basis-0/);
  assert.match(appShell, /whitespace-nowrap/);
  assert.match(appShell, /rewards:\s*Gift/);
  assert.match(appShell, /min-h-11/);
  assert.doesNotMatch(appShell, /⭐/);
});

test("active workout dock stays above and clear of the mobile navigation", async () => {
  const [globals, activeWorkoutDock] = await Promise.all([
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(
      new URL("components/workouts/ActiveWorkoutDock.tsx", projectRoot),
      "utf8"
    ),
  ]);

  assert.match(globals, /\.app-mobile-nav\s*\{[^}]*z-index:\s*60/s);
  assert.match(
    activeWorkoutDock,
    /bottom-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\]/
  );
  assert.match(activeWorkoutDock, /z-50/);
});
