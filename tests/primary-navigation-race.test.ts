import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  beginPrimaryNavigationIntent,
  settlePrimaryNavigationIntent,
  type PrimaryNavigationIntent,
} from "@/lib/primary-navigation-intent";

function navigate(
  current: PrimaryNavigationIntent | null,
  href: string
): PrimaryNavigationIntent {
  return beginPrimaryNavigationIntent(current?.generation ?? 0, href);
}

test("an older primary navigation cannot settle over the latest user intent", () => {
  const nutrition = navigate(null, "/nutrition");
  const community = navigate(nutrition, "/feed");

  const afterStaleNutrition = settlePrimaryNavigationIntent(
    community,
    nutrition.generation,
    "/nutrition"
  );

  assert.deepEqual(afterStaleNutrition, community);
  assert.equal(afterStaleNutrition?.href, "/feed");
});

test("reversed completion of three older navigations leaves Rewards selected", () => {
  const home = navigate(null, "/home");
  const nutrition = navigate(home, "/nutrition");
  const parks = navigate(nutrition, "/parks");
  const rewards = navigate(parks, "/rewards");

  let current: PrimaryNavigationIntent | null = rewards;
  for (const stale of [parks, nutrition, home]) {
    current = settlePrimaryNavigationIntent(
      current,
      stale.generation,
      stale.href
    );
  }

  assert.deepEqual(current, rewards);
  assert.equal(current?.href, "/rewards");
});

test("only the current generation at its own committed route may settle", () => {
  const nutrition = navigate(null, "/nutrition");
  const community = navigate(nutrition, "/feed");

  assert.deepEqual(
    settlePrimaryNavigationIntent(
      community,
      community.generation,
      "/nutrition"
    ),
    community
  );
  assert.equal(
    settlePrimaryNavigationIntent(
      community,
      community.generation,
      "/feed"
    ),
    null
  );
});

test("a stale Nutrition completion cannot overwrite a newer one-tap Profile intent", () => {
  const nutrition = navigate(null, "/nutrition");
  const profile = navigate(nutrition, "/profile");
  assert.deepEqual(settlePrimaryNavigationIntent(profile, nutrition.generation, "/nutrition"), profile);
  assert.equal(profile.href, "/profile");
  assert.equal(settlePrimaryNavigationIntent(profile, profile.generation, "/profile"), null);
});

test("one Profile activation wins from every primary destination", () => {
  for (const href of ["/home", "/nutrition", "/parks", "/feed", "/rewards"]) {
    const previous = navigate(null, href);
    const profile = navigate(previous, "/profile");
    assert.equal(profile.href, "/profile");
    assert.equal(profile.generation, previous.generation + 1);
  }
});

test("rapid navigation through all six destinations ends on Profile", () => {
  let current: PrimaryNavigationIntent | null = null;
  for (const href of ["/home", "/nutrition", "/parks", "/feed", "/rewards", "/profile"]) current = navigate(current, href);
  assert.equal(current?.href, "/profile");
  assert.equal(current?.generation, 6);
});

test("AppShell uses the generation guard and does not restore from timers or prefetch", async () => {
  const shell = await readFile(
    new URL("../components/navigation/AppShell.tsx", import.meta.url),
    "utf8"
  );

  assert.match(shell, /settlePrimaryNavigationIntent\(/);
  assert.match(shell, /window\.addEventListener\("popstate"/);
  assert.doesNotMatch(shell, /pendingOriginPathname/);
  assert.doesNotMatch(shell, /setTimeout\([^)]*setNavigationIntent/);
  assert.doesNotMatch(shell, /router\.prefetch\([^)]*\)\.(then|finally)/);
  assert.doesNotMatch(shell, /router\.(push|replace)\(/);
});
