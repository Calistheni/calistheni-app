import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("QR schema is additive, defaults existing parks to no QR, and is indexed", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(
      new URL(
        "prisma/migrations/20260728150000_add_park_qr_deployment/migration.sql",
        root
      ),
      "utf8"
    ),
  ]);

  assert.match(schema, /enum ParkQrStatus[\s\S]*NOT_INSTALLED[\s\S]*INSTALLED[\s\S]*NEEDS_REPLACEMENT/);
  assert.match(schema, /qrStatus\s+ParkQrStatus\s+@default\(NOT_INSTALLED\)/);
  assert.match(schema, /qrInstalledAt\s+DateTime\?/);
  assert.match(schema, /qrInstalledByLabel\s+String\?/);
  assert.match(schema, /qrCodeNote\s+String\?/);
  assert.match(schema, /@@index\(\[qrStatus\]\)/);
  assert.match(migration, /DEFAULT 'NOT_INSTALLED'/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/);
});

test("admin QR route authenticates, rejects invalid status, and generates time server-side", async () => {
  const route = await readFile(
    new URL("app/api/admin/parks/[id]/qr/route.ts", root),
    "utf8"
  );

  assert.match(route, /isAdminAuthenticated/);
  assert.match(route, /PARK_QR_UPDATE_FORBIDDEN/);
  assert.match(route, /PARK_QR_STATUS_INVALID/);
  assert.match(route, /PARK_NOT_FOUND/);
  assert.match(route, /const now = new Date\(\)/);
  assert.doesNotMatch(route, /body\.(installedAt|adminId|userId)/);
});

test("admin session records a signed actor label for QR attribution", async () => {
  const [form, action, auth] = await Promise.all([
    readFile(
      new URL("components/admin/AdminLoginForm.tsx", root),
      "utf8"
    ),
    readFile(new URL("app/admin/login/actions.ts", root), "utf8"),
    readFile(new URL("lib/admin-auth.ts", root), "utf8"),
  ]);

  assert.match(form, /name="adminName"/);
  assert.match(action, /createAdminSession\(adminName\.trim\(\)\)/);
  assert.match(auth, /encodedActor/);
  assert.match(auth, /getAdminActorLabel/);
});

test("admin QR badge and editor expose all textual states", async () => {
  const [badge, control, dashboard] = await Promise.all([
    readFile(
      new URL("components/admin/ParkQrStatusBadge.tsx", root),
      "utf8"
    ),
    readFile(
      new URL("components/admin/ParkQrStatusControl.tsx", root),
      "utf8"
    ),
    readFile(
      new URL("components/admin/AdminDashboard.tsx", root),
      "utf8"
    ),
  ]);

  for (const label of ["No QR", "QR installed", "Replace QR"]) {
    assert.match(badge, new RegExp(label));
  }
  assert.match(control, /Deployment note \(optional\)/);
  assert.match(control, /Marked by/);
  assert.match(control, /toast\.success/);
  assert.match(dashboard, /<ParkQrStatusBadge/);
  assert.match(dashboard, /<ParkQrStatusControl/);
  assert.match(dashboard, /Has QR/);
  assert.match(dashboard, /Needs replacement/);
});

test("public park selects do not expose private QR deployment metadata", async () => {
  const [parks, publicRoute, adminRoute] = await Promise.all([
    readFile(new URL("lib/parks.ts", root), "utf8"),
    readFile(new URL("app/api/parks/map/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/parks/map/route.ts", root), "utf8"),
  ]);

  const publicSelect = parks.slice(
    parks.indexOf("const parkSummarySelect"),
    parks.indexOf("type ParkWithLatestPhoto")
  );
  assert.doesNotMatch(
    publicSelect,
    /qrInstalledAt|qrInstalledByLabel|qrCodeNote|qrStatus/
  );
  assert.doesNotMatch(publicRoute, /qrInstalledAt|qrInstalledByLabel|qrCodeNote/);
  assert.match(adminRoute, /isAdminAuthenticated/);
  assert.match(adminRoute, /Cache-Control": "private, no-store"/);
});

test("the admin map popup changes QR status inline while public map stays private", async () => {
  const [popup, map, publicMapRoute] = await Promise.all([
    readFile(new URL("components/admin/AdminMapParkPopup.tsx", root), "utf8"),
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("app/api/parks/map/route.ts", root), "utf8"),
  ]);

  assert.match(popup, /\/api\/admin\/parks\/\$\{park\.id\}\/qr/);
  assert.match(popup, /<Select/);
  assert.match(popup, /toast\.success/);
  assert.match(popup, /Archived/);
  assert.match(map, /<AdminMapParkPopup/);
  assert.doesNotMatch(publicMapRoute, /qrStatus|qrCodeNote|qrInstalledByLabel/);
});

test("admin park creation uses the same server-owned QR deployment updater", async () => {
  const [createRoute, dashboard, map, adminMap] = await Promise.all([
    readFile(new URL("app/api/parks/route.ts", root), "utf8"),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminParksMap.tsx", root), "utf8"),
  ]);

  assert.match(createRoute, /getAdminActorLabel/);
  assert.match(createRoute, /getParkQrUpdateData/);
  assert.match(createRoute, /const now = new Date\(\)/);
  assert.match(dashboard, /QR Deployment/);
  assert.match(dashboard, /park-qr-status/);
  assert.match(dashboard, /selectedPark=\{selectedPark\}/);
  assert.match(map, /selectedMarkerRef/);
  assert.match(map, /onAdminParkSelected/);
  assert.match(adminMap, /onAdminParkSelected/);
});

test("rejected parks use the shared archived presentation across map, list, and popup", async () => {
  const [map, dashboard, popup] = await Promise.all([
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminMapParkPopup.tsx", root), "utf8"),
  ]);

  for (const source of [map, dashboard, popup]) {
    assert.match(source, /isParkArchivedForAdminMap/);
  }
  assert.match(popup, /Rejected/);
  assert.match(dashboard, /Rejected/);
});
