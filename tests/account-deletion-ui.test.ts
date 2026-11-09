import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("profile settings expose the account-deletion danger zone", () => {
  const profile = read("../app/(primary)/@profile/profile/page.tsx");
  const component = read("../components/profile/AccountDeletionSection.tsx");
  assert.match(profile, /<AccountDeletionSection hasWebsiteSubscription=/);
  assert.match(component, /Delete Account/);
  assert.match(component, /deleted accounts cannot be recovered/i);
});

test("deletion UI preserves the subscription warning and posts the existing confirmation contract", () => {
  const component = read("../components/profile/AccountDeletionSection.tsx");
  assert.match(component, /does not automatically cancel your subscriptions/i);
  assert.match(component, /Manage Website Subscription/);
  assert.match(component, /Manage Apple Subscription/);
  assert.match(component, /showAppleSubscriptionManagement\(\)/);
  assert.match(component, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
  assert.match(component, /const SUPPORT_EMAIL = "hello@calistheni\.app"/);
  assert.match(component, /href=\{`mailto:\$\{SUPPORT_EMAIL\}`\}/);
  assert.match(component, /personal information will be deleted or anonymized within 30 days/i);
  assert.match(component, /register again later with the same email or sign-in method[\s\S]*new account[\s\S]*will not be restored or transferred/i);
  assert.match(component, /\/api\/account\/deletion\/request/);
  assert.match(component, /confirmation: "DELETE_MY_ACCOUNT"/);
  assert.match(component, /<AlertDialog/);
  assert.match(component, /if \(busy \|\| !status\?\.recentAuthentication/);
  assert.match(component, /disabled=\{!canConfirm \|\| busy\}/);
  assert.match(component, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(component, /flex flex-col gap-2 sm:flex-row/);
  assert.doesNotMatch(component, /window\.confirm\(/);
});

test("reauthentication state comes from the server and native logout clears the secure session", () => {
  const component = read("../components/profile/AccountDeletionSection.tsx");
  const enrollment = read("../lib/native/native-session-enrollment.ts");
  assert.match(component, /\/api\/auth\/accounts/);
  assert.match(component, /status\?\.recentAuthentication/);
  assert.match(component, /\/api\/auth\/password\/manage/);
  assert.match(component, /performNativeAppleAuth\("login"\)/);
  assert.match(component, /\/api\/native-auth\/attempt/);
  assert.match(component, /clearNativeSessionToken\(\)/);
  assert.match(enrollment, /SecureSession\.clearSessionToken\(\)/);
  assert.match(component, /router\.replace\("\/account-deleted"\)/);
});

test("admin deletion review is protected and offers explicit review actions", () => {
  const page = read("../app/admin/account-deletions/page.tsx");
  const client = read("../components/admin/AccountDeletionReviews.tsx");
  const endpoint = read("../app/api/admin/account-deletion/review-tasks/route.ts");
  assert.match(page, /isAdminAuthenticated\(\)/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
  assert.match(endpoint, /isAdminAuthenticated\(\)/);
  assert.match(client, /KEEP_ANONYMIZED/);
  assert.match(client, /REMOVE_FROM_PUBLIC/);
  assert.match(client, /cleanupDeadline/);
  assert.match(client, /overdueDeletions/);
  assert.match(client, /outstandingReviewTasks/);
  assert.match(client, /activeCleanups/);
  assert.match(client, /failedMediaCleanup/);
  assert.match(client, /pendingAppleRevocations/);
  assert.match(client, /failedAppleRevocations/);
  assert.match(endpoint, /oldestPendingDeletionAt/);
  assert.match(client, /Load more review tasks/);
  assert.match(endpoint, /nextCursor/);
});
