import assert from "node:assert/strict";
import test from "node:test";

const source = (path: string) => import("node:fs/promises").then((fs) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("admin users list and detail endpoints are server-authorized", async () => {
  const [list, detail, page] = await Promise.all([
    source("app/api/admin/users/route.ts"),
    source("app/api/admin/users/[id]/route.ts"),
    source("app/admin/users/page.tsx"),
  ]);
  assert.match(list, /isAdminAuthenticated/);
  assert.match(detail, /isAdminAuthenticated/);
  assert.match(list, /createUnauthorizedResponse/);
  assert.match(detail, /createUnauthorizedResponse/);
  assert.match(page, /isAdminAuthenticated/);
});

test("admin insight derives a privacy-bounded timeline from canonical product records", async () => {
  const [service, component] = await Promise.all([source("lib/admin-user-insights.ts"), source("components/admin/AdminUserInsight.tsx")]);
  for (const model of ["nutritionEntrySnapshot", "nutritionAiUsage", "userSupplementPlan", "userFollow", "personalRecord", "submittedParks"]) assert.match(service, new RegExp(model));
  assert.match(component, /No raw prompts or photos/);
  assert.doesNotMatch(service, /promptSnapshot|imageData|mealPhoto/);
  assert.match(service, /timeline\.slice\(0, 50\)/);
});

test("user list supports requested filters and bounded cursor pagination", async () => {
  const service = await source("lib/admin-user-insights.ts");
  for (const filter of ["FREE", "PRO", "LIFETIME", "RECENTLY_ACTIVE", "INACTIVE", "HAS_WORKOUTS", "HAS_NUTRITION", "HAS_PARKS", "PENDING_FOODS"]) assert.match(service, new RegExp(`"${filter}"`));
  assert.match(service, /take: PAGE_SIZE \+ 1/);
  assert.match(service, /nextCursor/);
});

test("last activity is a throttled authenticated presence heartbeat", async () => {
  const [schema, route, heartbeat] = await Promise.all([
    source("prisma/schema.prisma"),
    source("app/api/user/activity/route.ts"),
    source("components/user/UserActivityHeartbeat.tsx"),
  ]);
  assert.match(schema, /lastActiveAt\s+DateTime\?/);
  assert.match(route, /getAuthenticatedUserId/);
  assert.match(route, /HEARTBEAT_INTERVAL_MS/);
  assert.match(route, /lastActiveAt/);
  assert.match(heartbeat, /10 \* 60 \* 1000/);
});

test("individual insight renders separate workout, nutrition, AI, supplements, contributions, social, and records areas", async () => {
  const component = await source("components/admin/AdminUserInsight.tsx");
  for (const tab of ["Workouts", "Nutrition", "AI usage", "Supplements", "Contributions", "Social", "Records"]) assert.match(component, new RegExp(`>${tab}<`));
  assert.match(component, /Account role unavailable/);
  assert.match(component, /Barcode camera scans are not retained/);
});
