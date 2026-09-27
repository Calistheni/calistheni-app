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
