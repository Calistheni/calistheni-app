import assert from "node:assert/strict";
import test from "node:test";
import {
  PHOTO_LOCATION_MATCH_RADIUS_METERS,
  normalizePhotoLocationVerifications,
  summarizeParkGpsVerification,
  verifyPhotoLocation,
} from "../lib/photo-location-verification.ts";

test("GPS verification preserves coordinates and uses the shared 500 m Haversine threshold", () => {
  assert.equal(PHOTO_LOCATION_MATCH_RADIUS_METERS, 500);
  assert.equal(verifyPhotoLocation({ photoLatitude: 42.6977, photoLongitude: 23.3219, parkLatitude: 42.6977, parkLongitude: 23.3219 }).locationStatus, "MATCHED");
  assert.equal(verifyPhotoLocation({ photoLatitude: 42.6977, photoLongitude: 23.3219, parkLatitude: 42.7077, parkLongitude: 23.3319 }).locationStatus, "MISMATCH");
  const records = normalizePhotoLocationVerifications([{ photoLatitude: 42.6977, photoLongitude: 23.3219 }], 1, 42.6977, 23.3219);
  assert.equal(records[0]?.photoLatitude, 42.6977);
  assert.equal(records[0]?.photoLongitude, 23.3219);
});

test("admin GPS summary uses the closest EXIF photo and treats absent GPS as neutral", () => {
  const stored = normalizePhotoLocationVerifications([
    { photoLatitude: 42.6977, photoLongitude: 23.3219 },
    { photoLatitude: 42.71, photoLongitude: 23.33 },
  ], 2, 42.6977, 23.3219);
  const summary = summarizeParkGpsVerification(stored, 2, 42.6977, 23.3219);
  assert.equal(summary.status, "MATCHED");
  assert.equal(summary.gpsPhotoCount, 2);
  assert.equal(summary.metadata?.photoIndex, 1);
  assert.equal(summarizeParkGpsVerification([], 0, 42.6977, 23.3219).status, "NO_GPS_DATA");
  assert.equal(summarizeParkGpsVerification([{ locationStatus: "NO_GPS_DATA", locationDistanceMeters: null, locationSource: "NONE" }], 1, 42.6977, 23.3219).status, "NO_GPS_DATA");
});

test("accepted admin park detail uses the permanent submitter relation and persisted GPS fields", async () => {
  const fs = await import("node:fs/promises");
  const [adminParks, dashboard, approval, schema, detailRoute] = await Promise.all([
    fs.readFile(new URL("../lib/admin-parks.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../components/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/api/admin/submissions/[id]/route.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    fs.readFile(new URL("../app/api/admin/parks/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /submittedById\s+String\?/);
  assert.match(schema, /submittedBy\s+User\?.*ParkSubmitter/);
  assert.match(adminParks, /submittedBy: \{\s*select: \{ id: true, name: true, email: true \}/);
  assert.match(adminParks, /summarizeParkGpsVerification/);
  assert.match(approval, /photoLocationVerifications: submission\.photoLocationVerifications/);
  assert.match(dashboard, /<p className="text-sm font-medium">Submission<\/p>/);
  assert.match(dashboard, /Photo GPS verification/);
  assert.match(dashboard, /No GPS coordinates found in uploaded photos/);
  assert.match(detailRoute, /isAdminAuthenticated/);
});
