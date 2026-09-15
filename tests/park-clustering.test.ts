import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildParkOverviewFeatures,
  buildParkOverviewGeoJson,
  type ParkOverviewRow,
} from "../lib/park-map-overview.ts";

const root = new URL("../", import.meta.url);

function row(overrides: Partial<ParkOverviewRow> = {}): ParkOverviewRow {
  return {
    latCell: 66,
    lonCell: 150,
    lat: 43,
    lon: -54,
    count: 1,
    parkId: 91,
    name: "Newfoundland Park",
    title: "Outdoor gym",
    address: null,
    photoUrl: null,
    updatedAt: "2026-09-14T08:00:00.000Z",
    ...overrides,
  };
}

test("a one-park overview cell becomes a real selectable park point", () => {
  const overview = buildParkOverviewFeatures([row()]);
  assert.equal(overview.length, 1);
  assert.equal(overview[0]?.featureKind, "park");
  if (overview[0]?.featureKind !== "park") return;
  assert.equal(overview[0].park.id, 91);

  const geoJson = buildParkOverviewGeoJson(overview);
  assert.deepEqual(geoJson.features[0]?.properties, {
    featureKind: "park",
    parkId: 91,
    park_count_value: 1,
  });
  assert.equal(
    (geoJson.features[0]?.properties as Record<string, unknown> | null)?.count,
    undefined
  );
});

test("two- and five-park cells remain valid bounded aggregates", () => {
  const overview = buildParkOverviewFeatures([
    row({ count: 2 }),
    row({ latCell: 67, count: 5 }),
  ]);
  assert.deepEqual(
    overview.map((feature) =>
      feature.featureKind === "aggregate" ? feature.count : 1
    ),
    [2, 5]
  );
  assert.deepEqual(
    overview[0]?.featureKind === "aggregate" ? overview[0].bounds : null,
    { west: 120, south: 42, east: 122, north: 44 }
  );
});

test("invalid empty and identity-less singleton aggregates are excluded", () => {
  assert.deepEqual(
    buildParkOverviewFeatures([
      row({ count: 0 }),
      row({ parkId: 0 }),
      row({ name: "" }),
    ]),
    []
  );

  const invalidGeoJson = buildParkOverviewGeoJson([
    {
      featureKind: "aggregate",
      id: "invalid",
      lat: 43,
      lon: -54,
      count: 1,
      bounds: { west: -56, south: 42, east: -54, north: 44 },
    },
  ]);
  assert.equal(invalidGeoJson.features.length, 0);
});

test("map layers separate actual parks from clusters and require cluster counts of two", async () => {
  const map = await readFile(new URL("components/ParksMap.tsx", root), "utf8");

  assert.match(
    map,
    /id: "park-placeholder-circles"[\s\S]{0,700}\[">=", \["get", "point_count"\], 2\][\s\S]{0,300}\[">=", \["get", "count"\], 2\]/
  );
  assert.match(
    map,
    /id: "park-placeholder-points"[\s\S]{0,500}\["==", \["get", "featureKind"\], "park"\][\s\S]{0,100}\["has", "parkId"\]/
  );
  assert.match(
    map,
    /id: "clusters"[\s\S]{0,200}minzoom: detailedParkLayerMinZoom[\s\S]{0,300}\[">=", \["get", "point_count"\], 2\]/
  );
  assert.match(
    map,
    /id: "unclustered-point"[\s\S]{0,500}minzoom: detailedParkLayerMinZoom[\s\S]{0,400}\["==", \["get", "featureKind"\], "park"\]/
  );
  assert.match(
    map,
    /const detailedParkLayerMinZoom =\s*mode === "public" \? PLACEHOLDER_MAX_ZOOM : 0/
  );
});

test("aggregate clicks fetch their exact cell and stale responses cannot win", async () => {
  const map = await readFile(new URL("components/ParksMap.tsx", root), "utf8");

  assert.match(map, /function getOverviewViewport/);
  assert.match(
    map,
    /requestViewportParksRef\.current\(\{\s*force: true,\s*viewport,\s*\}\)/
  );
  assert.match(map, /const resolutionId = \+\+placeholderResolutionIdRef\.current/);
  assert.match(map, /resolutionId !== placeholderResolutionIdRef\.current/);
  assert.match(map, /overview aggregate resolved empty/);
  assert.match(map, /source\.setData\(buildGeoJson\(parksRef\.current\)\)/);
});

test("terminal same-coordinate clusters expose a real leaf park", async () => {
  const map = await readFile(new URL("components/ParksMap.tsx", root), "utf8");

  assert.match(map, /const openFirstClusterPark = \(\) =>/);
  assert.match(map, /source\.getClusterLeaves\(\s*clusterId,\s*pointCount/);
  assert.match(map, /hasCompleteMembership/);
  assert.match(
    map,
    /zoom <= map\.getZoom\(\) \|\| map\.getZoom\(\) >= map\.getMaxZoom\(\)/
  );
  assert.match(map, /openParkPopupRef\.current\(/);
});
