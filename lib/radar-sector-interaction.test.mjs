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
  const back = pointAtClockwiseAngle(45);
  const legs = pointAtClockwiseAngle(315);

  assert.equal(
    getRadarSectorIndex({ ...chest, width: 200, height: 200, count: 8 }),
    0
  );
  assert.equal(
    getRadarSectorIndex({ ...back, width: 200, height: 200, count: 8 }),
    1
  );
  assert.equal(
    getRadarSectorIndex({ ...legs, width: 200, height: 200, count: 8 }),
    7
  );
});

test("low-value muscles remain selectable close to the chart center", () => {
  const backNearCenter = pointAtClockwiseAngle(45, 4);
  const legsNearCenter = pointAtClockwiseAngle(315, 4);

  assert.equal(
    getRadarSectorIndex({
      ...backNearCenter,
      width: 200,
      height: 200,
      count: 8,
    }),
    1
  );
  assert.equal(
    getRadarSectorIndex({
      ...legsNearCenter,
      width: 200,
      height: 200,
      count: 8,
    }),
    7
  );
});

test("moving across adjacent angular sectors changes the active muscle", () => {
  const backSide = pointAtClockwiseAngle(66);
  const shouldersSide = pointAtClockwiseAngle(69);

  assert.equal(
    getRadarSectorIndex({
      ...backSide,
      width: 200,
      height: 200,
      count: 8,
    }),
    1
  );
  assert.equal(
    getRadarSectorIndex({
      ...shouldersSide,
      width: 200,
      height: 200,
      count: 8,
    }),
    2
  );
});

test("sector geometry scales from the actual plot dimensions", () => {
  const small = getRadarSectorGeometry({
    plotArea: { left: 20, top: 20, width: 160, height: 160 },
    index: 1,
    count: 8,
  });
  const large = getRadarSectorGeometry({
    plotArea: { left: 40, top: 40, width: 320, height: 320 },
    index: 1,
    count: 8,
  });

  assert.ok(small);
  assert.ok(large);
  assert.equal(large.radius, small.radius * 2);
  assert.match(small.path, /^M /);
});

test("keyboard navigation wraps between muscle categories", () => {
  assert.equal(getAdjacentRadarSectorIndex(0, -1, 8), 7);
  assert.equal(getAdjacentRadarSectorIndex(7, 1, 8), 0);
  assert.equal(getAdjacentRadarSectorIndex(1, 1, 8), 2);
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
      directSets: 72,
      assistingSets: 50,
      assistingWorkload: 25,
      workloadScore: 97,
    }),
    "Back. 72 direct sets, 50 assisting sets, 25 assisting workload, 97 workload score."
  );
});
