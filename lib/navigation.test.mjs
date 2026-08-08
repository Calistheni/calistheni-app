import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivePrimaryNavigation,
  mobilePrimaryNavigation,
} from "./navigation.ts";

test("mobile primary navigation has six canonical destinations", () => {
  assert.deepEqual(
    mobilePrimaryNavigation.map(({ label, href }) => [label, href]),
    [
      ["Home", "/home"],
      ["Nutrition", "/nutrition"],
      ["Parks", "/parks"],
      ["Community", "/feed"],
      ["Rewards", "/rewards"],
      ["Profile", "/profile"],
    ]
  );
  assert.equal(mobilePrimaryNavigation.length, 6);
});

test("nutrition occupies the former Train destination and workouts remain reachable routes", async () => {
  const { desktopPrimaryNavigation } = await import("./navigation.ts");
  assert.ok(
    desktopPrimaryNavigation.some(
      ({ key, href, label }) =>
        key === "nutrition" && href === "/nutrition" && label === "Nutrition"
    )
  );
  assert.equal(
    desktopPrimaryNavigation.some(({ key, href }) => key === "train" || href === "/workouts"),
    false
  );
  assert.equal(getActivePrimaryNavigation("/nutrition"), "nutrition");
});

test("community stays active across feed, people, and public profiles", () => {
  assert.equal(getActivePrimaryNavigation("/feed"), "community");
  assert.equal(getActivePrimaryNavigation("/users"), "community");
  assert.equal(getActivePrimaryNavigation("/users/user-1"), "community");
});

test("rewards stays active for its canonical and nested routes", () => {
  assert.equal(getActivePrimaryNavigation("/rewards"), "rewards");
  assert.equal(
    getActivePrimaryNavigation("/rewards/redeem/reward-1"),
    "rewards"
  );
});

test("rewards remains a desktop destination", async () => {
  const { desktopPrimaryNavigation } = await import("./navigation.ts");
  assert.ok(
    desktopPrimaryNavigation.some(
      ({ key, href }) => key === "rewards" && href === "/rewards"
    )
  );
});
