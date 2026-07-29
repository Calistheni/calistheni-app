import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getParkBoundsWhere,
  isParkArchivedForAdminMap,
  getParkVisibilityWhere,
  parseParkArchiveStatus,
  parseParkMapQuery,
  parseParkQrStatus,
} from "./park-map-query.ts";

const root = new URL("../", import.meta.url);

test("valid bounds preserve latitude/longitude order and result limits", () => {
  const parsed = parseParkMapQuery(
    "https://example.com/api/parks/map?west=23.1&south=42.5&east=23.6&north=42.9&zoom=11"
  );
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.deepEqual(parsed.bounds, {
    minLat: 42.5,
    maxLat: 42.9,
    minLon: 23.1,
    maxLon: 23.6,
    zoom: 11,
  });
  assert.equal(parsed.limit, 5_000);
  assert.deepEqual(getParkBoundsWhere(parsed.bounds), {
    lat: { gte: 42.5, lte: 42.9 },
    lon: { gte: 23.1, lte: 23.6 },
  });
});

test("invalid and excessively large viewport bounds return typed errors", () => {
  const reversedLatitude = parseParkMapQuery(
    "https://example.com/api/parks/map?west=1&south=10&east=2&north=5&zoom=10"
  );
  assert.deepEqual(reversedLatitude, {
    success: false,
    code: "PARK_BOUNDS_INVALID",
    message: "Invalid map bounds or zoom.",
  });

  const tooLarge = parseParkMapQuery(
    "https://example.com/api/parks/map?west=-100&south=-50&east=100&north=50&zoom=2"
  );
  assert.equal(tooLarge.success, false);
  if (!tooLarge.success) {
    assert.equal(tooLarge.code, "PARK_BOUNDS_TOO_LARGE");
  }
});

test("antimeridian bounds use two longitude ranges", () => {
  assert.deepEqual(
    getParkBoundsWhere({
      minLat: -10,
      maxLat: 10,
      minLon: 170,
      maxLon: -170,
    }),
    {
      lat: { gte: -10, lte: 10 },
      OR: [{ lon: { gte: 170 } }, { lon: { lte: -170 } }],
    }
  );
});

test("QR filters accept only canonical status values", () => {
  assert.equal(parseParkQrStatus("INSTALLED"), "INSTALLED");
  assert.equal(parseParkQrStatus("NOT_INSTALLED"), "NOT_INSTALLED");
  assert.equal(
    parseParkQrStatus("NEEDS_REPLACEMENT"),
    "NEEDS_REPLACEMENT"
  );
  assert.equal(parseParkQrStatus("ALL", { allowAll: true }), "ALL");
  assert.equal(parseParkQrStatus("installed"), null);
});

test("visibility filters make active exactly match public visibility", () => {
  assert.equal(parseParkArchiveStatus(null, { allowAll: true }), "ACTIVE");
  assert.equal(parseParkArchiveStatus("ARCHIVED", { allowAll: true }), "ARCHIVED");
  assert.equal(parseParkArchiveStatus("ALL", { allowAll: true }), "ALL");
  assert.equal(parseParkArchiveStatus("deleted", { allowAll: true }), null);
  assert.deepEqual(getParkVisibilityWhere("ACTIVE"), {
    deletedAt: null,
    submissionStatus: "APPROVED",
  });
  assert.deepEqual(getParkVisibilityWhere("ARCHIVED"), {
    OR: [
      { deletedAt: { not: null } },
      { submissionStatus: { not: "APPROVED" } },
    ],
  });
  assert.deepEqual(getParkVisibilityWhere("ALL"), {});
  assert.equal(
    isParkArchivedForAdminMap({
      deletedAt: null,
      submissionStatus: "REJECTED",
    }),
    true
  );
  assert.equal(
    isParkArchivedForAdminMap({
      deletedAt: null,
      submissionStatus: "APPROVED",
    }),
    false
  );
});

test("public and admin map routes share the canonical bounds parser", async () => {
  const [publicRoute, adminRoute, parksService, dashboard] = await Promise.all([
    readFile(new URL("app/api/parks/map/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/parks/map/route.ts", root), "utf8"),
    readFile(new URL("lib/parks.ts", root), "utf8"),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
  ]);

  assert.match(publicRoute, /parseParkMapQuery\(request\.url\)/);
  assert.match(adminRoute, /parseParkMapQuery\(\s*request\.url/);
  assert.match(parksService, /getParkBoundsWhere\(bounds\)/);
  assert.equal(dashboard.includes('fetch("/api/parks")'), false);
  assert.doesNotMatch(dashboard, /loadAdminParks|saveAdminParks/);
});

test("admin mode reuses ParksMap clustering and disables placeholder fetches", async () => {
  const [map, adminMap] = await Promise.all([
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminParksMap.tsx", root), "utf8"),
  ]);

  assert.match(adminMap, /<ParksMap/);
  assert.match(adminMap, /mode="admin"/);
  assert.match(map, /cluster:\s*true/);
  assert.equal(
    map.includes('if (mode === "public")') &&
      map.includes('fetch("/api/parks/map/clusters")'),
    true
  );
  assert.match(map, /viewportRequestRef\.current\?\.controller\.abort\(\)/);
  assert.match(map, /Search this area/i);
});

test("admin map has one shared marker, public-equivalent active visibility, and map placement", async () => {
  const [map, adminMap, dashboard, adminService, publicService] = await Promise.all([
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminParksMap.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("lib/admin-parks.ts", root), "utf8"),
    readFile(new URL("lib/parks.ts", root), "utf8"),
  ]);

  assert.equal((map.match(/function SearchResultMarker/g) ?? []).length, 1);
  assert.match(map, /<SearchResultMarker\s*\/>/);
  assert.match(map, /<AdminMapParkPopup/);
  assert.match(map, /parkStatusFilter/);
  assert.match(adminMap, /Park management map/);
  assert.doesNotMatch(dashboard, /<CoordinatePicker/);
  assert.match(adminService, /getParkVisibilityWhere\(archiveStatus\)/);
  assert.match(publicService, /getParkVisibilityWhere\("ACTIVE"\)/);
  assert.match(map, /Add Park/);
  assert.match(map, /placementModeRef/);
  assert.match(map, /setPlacementCoordinates/);
  assert.match(map, /cursor-crosshair/);
  assert.match(map, /event\.key !== "Escape"/);
  assert.match(map, /event\.preventDefault\(\)/);
  assert.match(map, /placementResetToken/);
  assert.match(adminMap, /onAdminParkPlacement/);
  assert.match(dashboard, /beginMapParkCreate/);
});

test("public and admin share one stable selection path while location heading remains enabled", async () => {
  const [map, dashboard] = await Promise.all([
    readFile(new URL("components/ParksMap.tsx", root), "utf8"),
    readFile(new URL("components/admin/AdminDashboard.tsx", root), "utf8"),
  ]);

  assert.doesNotMatch(map, /ADMIN_SELECTED_PARK_ZOOM/);
  assert.doesNotMatch(map, /selectedPark\.lat[\s\S]{0,700}zoom: 17/);
  assert.match(map, /showUserHeading: true/);
  assert.match(map, /showAccuracyCircle: true/);
  assert.match(map, /requestUserHeadingFromGesture/);
  assert.match(map, /requestPermission/);
  assert.match(map, /_onDeviceOrientation/);
  assert.match(map, /window\.addEventListener\(eventName, geolocate\._onDeviceOrientation\)/);
  assert.match(map, /selectedParkCameraRequestRef/);
  assert.match(map, /selectedParkId,\n\s*selectedParkLat,\n\s*selectedParkLon/);
  assert.match(map, /requestViewportParksRef\.current\(\)/);
  assert.doesNotMatch(map, /MapLocationSearch/);
  assert.doesNotMatch(map, /Recenter on my location/);
  assert.doesNotMatch(map, /aria-label="Use my location"/);
  assert.match(dashboard, /adminSelectionRequestRef/);
  assert.match(dashboard, /selectionRequestId !== adminSelectionRequestRef\.current/);
  assert.match(
    dashboard,
    /setSelectedPark\(null\);[\s\S]{0,500}setSelectedParkPreview/
  );
  assert.match(
    dashboard,
    /selectedParkPreview\?\.id !== park\.id/
  );
});
