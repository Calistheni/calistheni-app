export const RADAR_START_ANGLE = 90;
export const RADAR_OUTER_RADIUS_RATIO = 0.7;

type RadarPlotArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type RadarPoint = {
  muscle: string;
  directSets: number;
  assistingSets: number;
  assistingWorkload: number;
  workloadScore: number;
};

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angle: number
) {
  const radians = (-angle * Math.PI) / 180;

  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius,
  };
}

export function getRadarSectorIndex({
  x,
  y,
  width,
  height,
  count,
  startAngle = RADAR_START_ANGLE,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  startAngle?: number;
}) {
  if (count <= 0 || width <= 0 || height <= 0) return null;

  const dx = x - width / 2;
  const dy = y - height / 2;

  if (Math.hypot(dx, dy) < 1) return null;

  const pointerAngle = normalizeAngle(
    (Math.atan2(-dy, dx) * 180) / Math.PI
  );
  const clockwiseFromStart = normalizeAngle(startAngle - pointerAngle);
  const sectorSize = 360 / count;

  return Math.round(clockwiseFromStart / sectorSize) % count;
}

export function getRadarSectorGeometry({
  plotArea,
  index,
  count,
  startAngle = RADAR_START_ANGLE,
  outerRadiusRatio = RADAR_OUTER_RADIUS_RATIO,
}: {
  plotArea: RadarPlotArea;
  index: number;
  count: number;
  startAngle?: number;
  outerRadiusRatio?: number;
}) {
  if (count <= 0 || index < 0 || index >= count) return null;

  const cx = plotArea.left + plotArea.width / 2;
  const cy = plotArea.top + plotArea.height / 2;
  const radius =
    (Math.min(plotArea.width, plotArea.height) / 2) * outerRadiusRatio;
  const sectorSize = 360 / count;
  const axisAngle = startAngle - index * sectorSize;
  const leadingPoint = polarPoint(
    cx,
    cy,
    radius,
    axisAngle + sectorSize / 2
  );
  const trailingPoint = polarPoint(
    cx,
    cy,
    radius,
    axisAngle - sectorSize / 2
  );
  const axisEnd = polarPoint(cx, cy, radius, axisAngle);

  return {
    cx,
    cy,
    radius,
    axisEnd,
    path: [
      `M ${cx} ${cy}`,
      `L ${leadingPoint.x} ${leadingPoint.y}`,
      `A ${radius} ${radius} 0 0 1 ${trailingPoint.x} ${trailingPoint.y}`,
      "Z",
    ].join(" "),
  };
}

export function getAdjacentRadarSectorIndex(
  index: number,
  direction: -1 | 1,
  count: number
) {
  if (count <= 0) return null;
  return (index + direction + count) % count;
}

export function formatRadarWorkloadValue(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

export function getRadarMuscleAriaLabel(point: RadarPoint) {
  return `${point.muscle}. ${formatRadarWorkloadValue(
    point.directSets
  )} direct sets, ${formatRadarWorkloadValue(
    point.assistingSets
  )} assisting sets, ${formatRadarWorkloadValue(
    point.assistingWorkload
  )} assisting workload, ${formatRadarWorkloadValue(
    point.workloadScore
  )} workload score.`;
}
