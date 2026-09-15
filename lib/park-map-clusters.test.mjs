import assert from "node:assert/strict";
import test from "node:test";
import Supercluster from "supercluster";
import {
  countRepresentedClusterChildren,
  dedupeParksById,
  getClusterLeafParkIds,
} from "./park-map-clusters.ts";

test("cluster transitions preserve represented park counts", () => {
  assert.equal(
    countRepresentedClusterChildren({
      childClusterCounts: [3],
      unclusteredParkIds: [4],
    }),
    4
  );
  assert.equal(
    countRepresentedClusterChildren({
      childClusterCounts: [2],
      unclusteredParkIds: [3],
    }),
    3
  );
  assert.equal(
    countRepresentedClusterChildren({
      childClusterCounts: [],
      unclusteredParkIds: [1, 2],
    }),
    2
  );
});

test("Halifax-style clusters decompose as 4, then 3 plus 1, then 2 plus two singles", () => {
  const features = [0, 0.0071, 0.0142, 0.0314].map((lonOffset, index) => ({
    type: "Feature",
    properties: { parkId: index + 1 },
    geometry: {
      type: "Point",
      coordinates: [-63.6 + lonOffset, 44.65],
    },
  }));
  const index = new Supercluster({ radius: 80, maxZoom: 13 }).load(features);
  const halifaxBounds = [-64, 44, -63, 45];
  const representedCountsAtZoom = (zoom) =>
    index
      .getClusters(halifaxBounds, zoom)
      .map((feature) => feature.properties.point_count ?? 1)
      .sort((left, right) => right - left);

  assert.deepEqual(representedCountsAtZoom(10), [4]);
  assert.deepEqual(representedCountsAtZoom(11), [3, 1]);
  assert.deepEqual(representedCountsAtZoom(12), [2, 1, 1]);
  assert.deepEqual(representedCountsAtZoom(13), [1, 1, 1, 1]);

  const finalCluster = index
    .getClusters(halifaxBounds, 12)
    .find((feature) => feature.properties.point_count === 2);
  assert.ok(finalCluster?.properties.cluster_id);
  const finalLeafIds = getClusterLeafParkIds(
    index.getLeaves(finalCluster.properties.cluster_id, 2)
  );
  assert.equal(finalLeafIds.length, 2);
  assert.equal(
    finalLeafIds.includes(3),
    false,
    "the nearby third park is not a leaf of the final two-park cluster"
  );
});

test("terminal cluster membership comes only from its unique leaves", () => {
  const leafIds = getClusterLeafParkIds([
    { properties: { parkId: 11 } },
    { properties: { parkId: 12 } },
    { properties: { parkId: 11 } },
    { properties: { parkId: "invalid" } },
  ]);

  assert.deepEqual(leafIds, [11, 12]);
  assert.equal(leafIds.includes(13), false, "nearby non-member is excluded");
});

test("duplicate park rows cannot inflate GeoJSON cluster membership", () => {
  assert.deepEqual(
    dedupeParksById([
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
      { id: 1, name: "Updated first" },
      { id: 0, name: "Invalid" },
    ]),
    [
      { id: 1, name: "Updated first" },
      { id: 2, name: "Second" },
    ]
  );
});
