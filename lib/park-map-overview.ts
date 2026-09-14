import type { ParkOverviewFeature } from "@/types/park";

export type ParkOverviewRow = {
  latCell: number;
  lonCell: number;
  lat: number;
  lon: number;
  count: number;
  parkId: number;
  name: string;
  title: string | null;
  address: string | null;
  photoUrl: string | null;
  updatedAt: Date | string;
};

const CELL_SIZE_DEGREES = 2;

function isFiniteCoordinate(value: number) {
  return Number.isFinite(value);
}

export function buildParkOverviewFeatures(
  rows: ParkOverviewRow[]
): ParkOverviewFeature[] {
  const features: ParkOverviewFeature[] = [];
  rows.forEach((row) => {
    const count = Number(row.count);
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (
      !Number.isInteger(count) ||
      count <= 0 ||
      !isFiniteCoordinate(lat) ||
      !isFiniteCoordinate(lon)
    ) {
      return;
    }

    if (count === 1) {
      const parkId = Number(row.parkId);
      if (!Number.isInteger(parkId) || parkId <= 0 || !row.name) return;

      features.push({
        featureKind: "park" as const,
        lat,
        lon,
        park: {
          id: parkId,
          name: row.name,
          title: row.title,
          lat,
          lon,
          address: row.address,
          photoUrl: row.photoUrl,
          updatedAt: new Date(row.updatedAt).toISOString(),
          deletedAt: null,
        },
      });
      return;
    }

    const south = Math.max(-90, row.latCell * CELL_SIZE_DEGREES - 90);
    const west = Math.max(-180, row.lonCell * CELL_SIZE_DEGREES - 180);
    features.push({
      featureKind: "aggregate" as const,
      id: `${row.latCell}:${row.lonCell}`,
      lat,
      lon,
      count,
      bounds: {
        west,
        south,
        east: Math.min(180, west + CELL_SIZE_DEGREES),
        north: Math.min(90, south + CELL_SIZE_DEGREES),
      },
    });
  });
  return features;
}

export function buildParkOverviewGeoJson(
  features: ParkOverviewFeature[]
): GeoJSON.FeatureCollection {
  const geoJsonFeatures: GeoJSON.Feature<
    GeoJSON.Point,
    Record<string, unknown>
  >[] = [];
  features.forEach((feature) => {
    if (feature.featureKind === "park") {
      if (!Number.isInteger(feature.park.id) || feature.park.id <= 0) return;
      geoJsonFeatures.push({
        type: "Feature",
        properties: {
          featureKind: "park",
          parkId: feature.park.id,
          park_count_value: 1,
        },
        geometry: {
          type: "Point",
          coordinates: [feature.lon, feature.lat],
        },
      });
      return;
    }

    if (!Number.isInteger(feature.count) || feature.count < 2) return;
    geoJsonFeatures.push({
      type: "Feature",
      properties: {
        featureKind: "aggregate",
        overviewId: feature.id,
        count: feature.count,
        park_count_value: feature.count,
        west: feature.bounds.west,
        south: feature.bounds.south,
        east: feature.bounds.east,
        north: feature.bounds.north,
      },
      geometry: {
        type: "Point",
        coordinates: [feature.lon, feature.lat],
      },
    });
  });
  return {
    type: "FeatureCollection",
    features: geoJsonFeatures,
  };
}
