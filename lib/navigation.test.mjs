import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivePrimaryNavigation,
  mobilePrimaryNavigation,
} from "./navigation.ts";

test("mobile primary navigation has five canonical destinations", () => {
  assert.deepEqual(
    mobilePrimaryNavigation.map(({ label, href }) => [label, href]),
    [
      ["Home", "/home"],
      ["Train", "/workouts"],
      ["Parks", "/parks"],
      ["Community", "/feed"],
      ["Profile", "/profile"],
    ]
  );
});

test("community stays active across feed, people, and public profiles", () => {
  assert.equal(getActivePrimaryNavigation("/feed"), "community");
  assert.equal(getActivePrimaryNavigation("/users"), "community");
  assert.equal(getActivePrimaryNavigation("/users/user-1"), "community");
});

test("rewards remains a desktop destination", async () => {
  const { desktopPrimaryNavigation } = await import("./navigation.ts");
  assert.ok(
    desktopPrimaryNavigation.some(
      ({ key, href }) => key === "rewards" && href === "/rewards"
    )
  );
});
