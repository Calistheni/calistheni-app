import type {
  ParkArchiveStatus,
  ParkQrStatus,
  ParkViewportBounds,
} from "@/types/park";

export const MAX_PARK_MAP_LONGITUDE_SPAN = 180;
export const MAX_PARK_MAP_LATITUDE_SPAN = 120;
export const ADMIN_PARK_SEARCH_LIMIT = 100;

export type ParsedParkMapQuery =
  | {
      success: true;
      bounds: ParkViewportBounds & { zoom: number };
      limit: number;
      areaKey: string;
    }
  | {
      success: false;
      code: "PARK_BOUNDS_INVALID" | "PARK_BOUNDS_TOO_LARGE";
      message: string;
    };

function parseFiniteParameter(url: URL, name: string) {
  const rawValue = url.searchParams.get(name);
  if (rawValue === null || rawValue.trim() === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

export function getLongitudeSpan(west: number, east: number) {
  return west <= east ? east - west : 180 - west + (east + 180);
}

export function getParkMapResultLimit(zoom: number) {
  if (zoom < 6) return 1_500;
  if (zoom < 9) return 2_500;
  return 5_000;
}

export function getParkMapAreaKey(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number,
  suffix?: string
) {
  return [
    Math.floor(zoom),
    west.toFixed(3),
    south.toFixed(3),
    east.toFixed(3),
    north.toFixed(3),
    suffix,
  ]
    .filter(Boolean)
    .join(":");
}

export function parseParkMapQuery(
  requestUrl: string,
  areaKeySuffix?: string
): ParsedParkMapQuery {
  const url = new URL(requestUrl);
  const west = parseFiniteParameter(url, "west");
  const south = parseFiniteParameter(url, "south");
  const east = parseFiniteParameter(url, "east");
  const north = parseFiniteParameter(url, "north");
  const zoom = parseFiniteParameter(url, "zoom");

  if (
    west === null ||
    south === null ||
    east === null ||
    north === null ||
    zoom === null ||
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90 ||
    south >= north ||
    west === east ||
    zoom < 0 ||
    zoom > 24
  ) {
    return {
      success: false,
      code: "PARK_BOUNDS_INVALID",
      message: "Invalid map bounds or zoom.",
    };
  }

  if (
    getLongitudeSpan(west, east) > MAX_PARK_MAP_LONGITUDE_SPAN ||
    north - south > MAX_PARK_MAP_LATITUDE_SPAN
  ) {
    return {
      success: false,
      code: "PARK_BOUNDS_TOO_LARGE",
      message: "Zoom in to search this area.",
    };
  }

  return {
    success: true,
    bounds: {
      minLat: south,
      maxLat: north,
      minLon: west,
      maxLon: east,
      zoom,
    },
    limit: getParkMapResultLimit(zoom),
    areaKey: getParkMapAreaKey(
      west,
      south,
      east,
      north,
      zoom,
      areaKeySuffix
    ),
  };
}

export function getParkBoundsWhere(bounds: ParkViewportBounds) {
  const { minLat, maxLat, minLon, maxLon } = bounds;

  return {
    lat: {
      gte: minLat,
      lte: maxLat,
    },
    ...(minLon <= maxLon
      ? {
          lon: {
            gte: minLon,
            lte: maxLon,
          },
        }
      : {
          OR: [{ lon: { gte: minLon } }, { lon: { lte: maxLon } }],
        }),
  };
}

export function parseParkQrStatus(
  value: unknown,
  options: { allowAll?: boolean } = {}
): ParkQrStatus | "ALL" | null {
  if (options.allowAll && (value === null || value === "" || value === "ALL")) {
    return "ALL";
  }
  return value === "NOT_INSTALLED" ||
    value === "INSTALLED" ||
    value === "NEEDS_REPLACEMENT"
    ? value
    : null;
}

export function parseParkArchiveStatus(
  value: unknown,
  options: { allowAll?: boolean } = {}
): ParkArchiveStatus | null {
  if (value === null || value === "" || value === undefined) {
    return "ACTIVE";
  }
  if (options.allowAll && value === "ALL") return "ALL";
  return value === "ACTIVE" || value === "ARCHIVED" ? value : null;
}

/**
 * The one visibility predicate used by the public map and admin map filters.
 * "Active" means publicly discoverable, not merely not soft-deleted.
 */
export function getParkVisibilityWhere(status: ParkArchiveStatus = "ACTIVE") {
  if (status === "ACTIVE") {
    return {
      deletedAt: null,
      submissionStatus: "APPROVED" as const,
    };
  }

  if (status === "ARCHIVED") {
    return {
      OR: [
        { deletedAt: { not: null } },
        { submissionStatus: { not: "APPROVED" as const } },
      ],
    };
  }

  return {};
}
