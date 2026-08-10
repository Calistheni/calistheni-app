import assert from "node:assert/strict";
import test from "node:test";

const source = (path: string) =>
  import("node:fs/promises").then((fs) =>
    fs.readFile(new URL(`../${path}`, import.meta.url), "utf8")
  );

test("admin contribution history supports every moderation status with shared counts", async () => {
  const [route, history] = await Promise.all([
    source("app/api/admin/nutrition/foods/route.ts"),
    source("lib/nutrition/admin-food-contributions.ts"),
  ]);
  assert.match(route, /foodContributionFilters/);
  assert.match(history, /"ALL"/);
  assert.match(history, /FoodContributionStatus\.PENDING/);
  assert.match(history, /FoodContributionStatus\.APPROVED/);
  assert.match(history, /FoodContributionStatus\.REJECTED/);
  assert.match(history, /groupBy/);
  assert.match(history, /nextCursor/);
});

test("moderation preserves the contribution and records the reviewer and decision time", async () => {
  const route = await source("app/api/admin/nutrition/foods/[id]/route.ts");
  assert.match(route, /getAdminActorLabel/);
  assert.match(route, /reviewedAt/);
  assert.match(route, /reviewedByAdminLabel/);
  assert.match(route, /rejectionReason/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test("admin history renders status filters, contributor details, and read-only completed decisions", async () => {
  const [component, page] = await Promise.all([
    source("components/admin/NutritionContributionsAdmin.tsx"),
    source("app/admin/nutrition/foods/page.tsx"),
  ]);
  assert.match(page, /Food contributions/);
  assert.match(component, /Approved/);
  assert.match(component, /Rejected/);
  assert.match(component, /Submitted by/);
  assert.match(component, /reviewedByAdminLabel/);
  assert.match(component, /food\.status === "PENDING"/);
  assert.match(component, /Contribution rejected and retained in history/);
});
