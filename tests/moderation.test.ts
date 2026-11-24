import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("moderation schema records confidential reports, blocks, restrictions, and audited actions", () => {
  const schema = read("../prisma/schema.prisma");
  const migration = read("../prisma/migrations/20261117210000_ugc_moderation/migration.sql");

  assert.match(schema, /model UserBlock[\s\S]*@@id\(\[blockerId, blockedId\]\)/);
  assert.match(schema, /model ModerationReport[\s\S]*reporterId\s+String\?/);
  assert.match(schema, /@@unique\(\[reporterId, targetType, targetId\]/);
  assert.match(schema, /model ModerationAction[\s\S]*actorLabel/);
  assert.match(schema, /communityRestrictedAt\s+DateTime\?/);
  assert.match(schema, /moderationHiddenAt\s+DateTime\?/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test("report intake is authenticated, validated, duplicate-safe, and rate limited", () => {
  const route = read("../app/api/moderation/reports/route.ts");
  const service = read("../lib/moderation.ts");

  assert.match(route, /getAuthenticatedUserId\(\)/);
  assert.match(route, /createUserUnauthorizedResponse\(\)/);
  assert.match(route, /reportSchema\.safeParse/);
  assert.match(route, /DUPLICATE[\s\S]*409/);
  assert.match(route, /RATE_LIMITED[\s\S]*429/);
  assert.match(service, /DAILY_REPORT_LIMIT = 10/);
  assert.match(service, /createdAt: \{ gte: since \}/);
  assert.match(service, /error\.code === "P2002"/);
  assert.match(service, /user\.id === reporterId/);
  assert.doesNotMatch(route, /reporterId.*request|body\.reporterId/);
});

test("blocking is server enforced and removes bidirectional social relationships", () => {
  const blockRoute = read("../app/api/users/[id]/block/route.ts");
  const community = read("../lib/community.ts");
  const moderation = read("../lib/moderation.ts");
  const followRoute = read("../app/api/users/[id]/follow/route.ts");
  const commentRoute = read("../app/api/workouts/[id]/comments/route.ts");
  const likeRoute = read("../app/api/workouts/[id]/like/route.ts");

  assert.match(blockRoute, /getAuthenticatedUserId\(\)/);
  assert.match(blockRoute, /blockerId === blockedId/);
  assert.match(blockRoute, /userBlock\.upsert/);
  assert.match(blockRoute, /userFollow\.deleteMany/);
  assert.match(blockRoute, /workoutNotification\.deleteMany/);
  assert.match(blockRoute, /export async function DELETE/);
  assert.match(community, /communityUserWhereForViewer/);
  assert.match(moderation, /blocksInitiated/);
  assert.match(moderation, /blocksReceived/);
  assert.match(followRoute, /usersBlockEachOther/);
  assert.match(commentRoute, /usersBlockEachOther/);
  assert.match(likeRoute, /usersBlockEachOther/);
});

test("moderation requires admin access and only includes reporter identity for park reports", () => {
  const page = read("../app/admin/moderation/page.tsx");
  const route = read("../app/api/admin/moderation/reports/[id]/route.ts");
  const listRoute = read("../app/api/admin/moderation/reports/route.ts");
  const service = read("../lib/moderation-admin.ts");

  assert.match(page, /isAdminAuthenticated\(\)/);
  assert.match(route, /isAdminAuthenticated\(\)/);
  assert.match(listRoute, /isAdminAuthenticated\(\)/);
  assert.match(service, /moderationAction\.create/);
  assert.match(service, /HIDE_CONTENT/);
  assert.match(service, /RESTRICT_USER/);
  assert.match(service, /userFollow\.deleteMany/);
  assert.match(service, /reporterId: report\.targetType === ModerationReportTarget\.PARK \? report\.reporterId : null/);
});

test("mobile moderation UI uses shadcn dialogs and exposes safety controls", () => {
  const menu = read("../components/community/ModerationMenu.tsx");
  const profile = read("../app/(primary)/@profile/profile/page.tsx");
  const guidelines = read("../app/community-guidelines/page.tsx");
  const blocked = read("../app/profile/blocked-users/page.tsx");

  assert.match(menu, /<DropdownMenu/);
  assert.match(menu, /<Dialog/);
  assert.match(menu, /<AlertDialog/);
  assert.match(menu, /Reports are confidential/);
  assert.match(menu, /max-w-md/);
  assert.match(profile, /href="\/profile\/blocked-users"/);
  assert.match(profile, /href="\/community-guidelines"/);
  assert.match(guidelines, /harass|Harass/i);
  assert.match(guidelines, /hateful conduct/i);
  assert.match(guidelines, /Contact Support/);
  assert.match(blocked, /BlockedUsersList/);
});

test("account deletion removes blocks and anonymizes retained moderation reports", () => {
  const worker = read("../lib/account-deletion-worker.ts");
  assert.match(worker, /deleteBatch\(prisma\.userBlock/);
  assert.match(worker, /moderationReport\.findMany/);
  assert.match(worker, /reporterId: null, explanation: null/);
  assert.match(worker, /targetLabel: "Deleted community content"/);
  assert.match(worker, /moderationAction\.updateMany/);
  assert.match(worker, /communityRestrictedAt: null/);
});
