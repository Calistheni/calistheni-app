import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRadarWorkloadValue,
  getAdjacentRadarSectorIndex,
  getRadarMuscleAriaLabel,
  getRadarSectorGeometry,
  getRadarSectorIndex,
} from "./radar-sector-interaction.ts";

function pointAtClockwiseAngle(angle, radius = 80, size = 200) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: size / 2 + Math.sin(radians) * radius,
    y: size / 2 - Math.cos(radians) * radius,
  };
}

test("full angular sectors select muscles without targeting polygon dots", () => {
  const chest = pointAtClockwiseAngle(0);
  const back = pointAtClockwiseAngle(36);
  const cardio = pointAtClockwiseAngle(324);

  assert.equal(
    getRadarSectorIndex({ ...chest, width: 200, height: 200, count: 10 }),
    0
  );
  assert.equal(
    getRadarSectorIndex({ ...back, width: 200, height: 200, count: 10 }),
    1
  );
  assert.equal(
    getRadarSectorIndex({ ...cardio, width: 200, height: 200, count: 10 }),
    9
  );
});

test("low-value muscles remain selectable close to the chart center", () => {
  const backNearCenter = pointAtClockwiseAngle(36, 4);
  const cardioNearCenter = pointAtClockwiseAngle(324, 4);

  assert.equal(
    getRadarSectorIndex({
      ...backNearCenter,
      width: 200,
      height: 200,
      count: 10,
    }),
    1
  );
  assert.equal(
    getRadarSectorIndex({
      ...cardioNearCenter,
      width: 200,
      height: 200,
      count: 10,
    }),
    9
  );
});

test("moving across adjacent angular sectors changes the active muscle", () => {
  const backSide = pointAtClockwiseAngle(52);
  const shouldersSide = pointAtClockwiseAngle(56);

  assert.equal(
    getRadarSectorIndex({
      ...backSide,
      width: 200,
      height: 200,
      count: 10,
    }),
    1
  );
  assert.equal(
    getRadarSectorIndex({
      ...shouldersSide,
      width: 200,
      height: 200,
      count: 10,
    }),
    2
  );
});

test("sector geometry scales from the actual plot dimensions", () => {
  const small = getRadarSectorGeometry({
    plotArea: { left: 20, top: 20, width: 160, height: 160 },
    index: 1,
    count: 10,
  });
  const large = getRadarSectorGeometry({
    plotArea: { left: 40, top: 40, width: 320, height: 320 },
    index: 1,
    count: 10,
  });

  assert.ok(small);
  assert.ok(large);
  assert.equal(large.radius, small.radius * 2);
  assert.match(small.path, /^M /);
});

test("keyboard navigation wraps between muscle categories", () => {
  assert.equal(getAdjacentRadarSectorIndex(0, -1, 10), 9);
  assert.equal(getAdjacentRadarSectorIndex(9, 1, 10), 0);
  assert.equal(getAdjacentRadarSectorIndex(1, 1, 10), 2);
});

test("tooltip values preserve integers, decimals, and larger totals", () => {
  assert.equal(formatRadarWorkloadValue(2), "2");
  assert.equal(formatRadarWorkloadValue(2.5), "2.5");
  assert.equal(formatRadarWorkloadValue(97), "97");
});

test("accessible labels include the muscle and supported workload details", () => {
  assert.equal(
    getRadarMuscleAriaLabel({
      muscle: "Back",
      primarySets: 72,
      secondaryContributions: 50,
      workloadSets: 97,
    }),
    "Back. 72 primary sets, 50 secondary contributions, 97 total workload sets."
  );
});
