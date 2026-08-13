export type MeasurementSystem = "METRIC" | "IMPERIAL";

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 2.2046226218;
export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.280839895;

function roundDisplay(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function displayNumber(value: number, digits = 1) {
  return String(roundDisplay(value, digits));
}

export function weightKgToDisplay(weightKg: number, measurementSystem: MeasurementSystem) {
  return measurementSystem === "IMPERIAL" ? weightKg * LB_PER_KG : weightKg;
}

export function displayWeightToKg(weight: number, measurementSystem: MeasurementSystem) {
  return measurementSystem === "IMPERIAL" ? weight * KG_PER_LB : weight;
}

export function weightUnit(measurementSystem: MeasurementSystem) {
  return measurementSystem === "IMPERIAL" ? "lb" : "kg";
}

export function formatWeight(weightKg: number, measurementSystem: MeasurementSystem) {
  return `${displayNumber(weightKgToDisplay(weightKg, measurementSystem))}${weightUnit(measurementSystem)}`;
}

export function distanceMetersToDisplay(distanceMeters: number, measurementSystem: MeasurementSystem) {
  return measurementSystem === "IMPERIAL" ? distanceMeters / METERS_PER_MILE : distanceMeters / 1000;
}

export function displayDistanceToMeters(distance: number, measurementSystem: MeasurementSystem) {
  return measurementSystem === "IMPERIAL" ? distance * METERS_PER_MILE : distance * 1000;
}

export function distanceInputUnit(measurementSystem: MeasurementSystem) {
  return measurementSystem === "IMPERIAL" ? "mi" : "km";
}

export function formatDistance(distanceMeters: number, measurementSystem: MeasurementSystem) {
  if (measurementSystem === "IMPERIAL") {
    const miles = distanceMeters / METERS_PER_MILE;
    return miles >= 0.1 ? `${displayNumber(miles, 2)}mi` : `${displayNumber(distanceMeters * FEET_PER_METER, 0)}ft`;
  }
  return distanceMeters >= 1000 ? `${displayNumber(distanceMeters / 1000, 2)}km` : `${displayNumber(distanceMeters, 0)}m`;
}

export function displayWeightInputValue(weightKg: number | null, measurementSystem: MeasurementSystem) {
  return weightKg === null ? "" : displayNumber(weightKgToDisplay(weightKg, measurementSystem));
}

export function displayDistanceInputValue(distanceMeters: number | null, measurementSystem: MeasurementSystem) {
  return distanceMeters === null ? "" : displayNumber(distanceMetersToDisplay(distanceMeters, measurementSystem), 2);
}
