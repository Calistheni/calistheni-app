import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("admin photo upload reuses the validated R2 park-photo pipeline", async () => {
  const [route, storage, dashboard] = await Promise.all([
    readFile(new URL("app/api/admin/parks/[id]/photos/route.ts", root), "utf8"),
    readFile(new URL("lib/park-photo-storage.ts", root), "utf8"),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
  ]);

  assert.match(route, /isAdminAuthenticated/);
  assert.match(route, /uploadParkPhoto/);
  assert.match(route, /PARK_PHOTO_MAX_COUNT/);
  assert.match(route, /PARK_PHOTO_MAX_FILE_SIZE/);
  assert.match(route, /deleteParkPhotoObject/);
  assert.match(storage, /validateParkPhotoMetadata/);
  assert.match(storage, /validateParkPhotoBytes/);
  assert.match(dashboard, /PARK_PHOTO_ACCEPT/);
  assert.match(dashboard, /addPendingParkPhotos/);
  assert.match(dashboard, /uploadPendingParkPhotos/);
});

test("admin photo operations cover the selected park only and clean up after a committed deletion", async () => {
  const [route, photoRoute, dashboard] = await Promise.all([
    readFile(new URL("app/api/admin/parks/[id]/photos/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/admin/parks/[id]/photos/[photoId]/route.ts", root),
      "utf8"
    ),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
  ]);

  assert.match(route, /where: \{ id: parkId \}/);
  assert.match(photoRoute, /id: parsedPhotoId,\s*parkId/);
  assert.match(photoRoute, /action === "DELETE"/);
  assert.match(photoRoute, /getParkPhotoKeyFromUrl/);
  assert.match(photoRoute, /references === 0/);
  assert.match(dashboard, /Remove park photo\?/);
  assert.match(dashboard, /AlertDialog/);
  assert.match(dashboard, /"SET_PRIMARY"/);
});

test("park photo model preserves one primary relation and hidden-photo support", async () => {
  const schema = await readFile(new URL("prisma/schema.prisma", root), "utf8");
  const model = schema.slice(schema.indexOf("model ParkPhoto"), schema.indexOf("model ParkEditSubmission"));

  assert.match(model, /parkId\s+Int/);
  assert.match(model, /isPrimary\s+Boolean\s+@default\(false\)/);
  assert.match(model, /hiddenAt\s+DateTime\?/);
  assert.match(model, /@relation\(fields: \[parkId\]/);
});
