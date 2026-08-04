export const PHOTO_LOCATION_MATCH_RADIUS_METERS = 500;

const EARTH_RADIUS_METERS = 6_371_000;

export type PhotoLocationStatus = "MATCHED" | "MISMATCH" | "NO_GPS_DATA";
export type PhotoLocationSource =
  | "PHOTO_EXIF"
  | "BROWSER_GEOLOCATION"
  | "NONE";

export type StoredPhotoLocationVerification = {
  locationStatus: PhotoLocationStatus;
  locationDistanceMeters: number | null;
  locationSource: PhotoLocationSource;
  photoLatitude?: number | null;
  photoLongitude?: number | null;
  deviceLatitude?: number | null;
  deviceLongitude?: number | null;
};

export type PhotoLocationVerificationDraft =
  StoredPhotoLocationVerification & {
    photoLatitude?: number | null;
    photoLongitude?: number | null;
    deviceLatitude?: number | null;
    deviceLongitude?: number | null;
  };

type VerifyPhotoLocationInput = {
  photoLatitude?: unknown;
  photoLongitude?: unknown;
  locationSource?: PhotoLocationSource;
  parkLatitude: number;
  parkLongitude: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPhotoLocationStatus(value: unknown): value is PhotoLocationStatus {
  return value === "MATCHED" || value === "MISMATCH" || value === "NO_GPS_DATA";
}

function isPhotoLocationSource(value: unknown): value is PhotoLocationSource {
  return (
    value === "PHOTO_EXIF" ||
    value === "BROWSER_GEOLOCATION" ||
    value === "NONE"
  );
}

function normalizeStoredVerification(
  value: unknown
): StoredPhotoLocationVerification {
  if (!isRecord(value) || !isPhotoLocationStatus(value.locationStatus)) {
    return {
      locationStatus: "NO_GPS_DATA",
      locationDistanceMeters: null,
      locationSource: "NONE",
    };
  }

  const locationDistanceMeters =
    typeof value.locationDistanceMeters === "number" &&
    Number.isFinite(value.locationDistanceMeters) &&
    value.locationDistanceMeters >= 0
      ? Math.round(value.locationDistanceMeters)
      : null;

  const photoLatitude = isValidLatitude(value.photoLatitude)
    ? value.photoLatitude
    : null;
  const photoLongitude = isValidLongitude(value.photoLongitude)
    ? value.photoLongitude
    : null;
  const deviceLatitude = isValidLatitude(value.deviceLatitude)
    ? value.deviceLatitude
    : null;
  const deviceLongitude = isValidLongitude(value.deviceLongitude)
    ? value.deviceLongitude
    : null;

  return {
    locationStatus: value.locationStatus,
    locationDistanceMeters:
      value.locationStatus === "NO_GPS_DATA" ? null : locationDistanceMeters,
    locationSource: isPhotoLocationSource(value.locationSource)
      ? value.locationSource
      : value.locationStatus === "NO_GPS_DATA"
      ? "NONE"
      : "PHOTO_EXIF",
    photoLatitude,
    photoLongitude,
    deviceLatitude,
    deviceLongitude,
  };
}

export function calculatePhotoLocationDistanceMeters(
  photoLatitude: number,
  photoLongitude: number,
  parkLatitude: number,
  parkLongitude: number
) {
  const latDelta = toRadians(parkLatitude - photoLatitude);
  const lonDelta = toRadians(parkLongitude - photoLongitude);
  const photoLatRadians = toRadians(photoLatitude);
  const parkLatRadians = toRadians(parkLatitude);

  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(photoLatRadians) *
      Math.cos(parkLatRadians) *
      Math.sin(lonDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function verifyPhotoLocation({
  photoLatitude,
  photoLongitude,
  locationSource = "PHOTO_EXIF",
  parkLatitude,
  parkLongitude,
}: VerifyPhotoLocationInput): StoredPhotoLocationVerification {
  if (
    !isValidLatitude(photoLatitude) ||
    !isValidLongitude(photoLongitude) ||
    !isValidLatitude(parkLatitude) ||
    !isValidLongitude(parkLongitude)
  ) {
    return {
      locationStatus: "NO_GPS_DATA",
      locationDistanceMeters: null,
      locationSource: "NONE",
    };
  }

  const locationDistanceMeters = Math.round(
    calculatePhotoLocationDistanceMeters(
      photoLatitude,
      photoLongitude,
      parkLatitude,
      parkLongitude
    )
  );

  return {
    locationStatus:
      locationDistanceMeters <= PHOTO_LOCATION_MATCH_RADIUS_METERS
        ? "MATCHED"
        : "MISMATCH",
    locationDistanceMeters,
    locationSource,
  };
}

export function normalizePhotoLocationVerifications(
  value: unknown,
  photoCount: number,
  parkLatitude: number,
  parkLongitude: number
): StoredPhotoLocationVerification[] {
  if (photoCount <= 0) {
    return [];
  }

  const items = Array.isArray(value) ? value : [];

  return Array.from({ length: photoCount }, (_, index) => {
    const item = items[index];

    if (!isRecord(item)) {
      return {
        locationStatus: "NO_GPS_DATA",
        locationDistanceMeters: null,
        locationSource: "NONE",
      };
    }

    if (
      isValidLatitude(item.photoLatitude) &&
      isValidLongitude(item.photoLongitude)
    ) {
      return {
        ...verifyPhotoLocation({
        photoLatitude: item.photoLatitude,
        photoLongitude: item.photoLongitude,
        locationSource: "PHOTO_EXIF",
        parkLatitude,
        parkLongitude,
        }),
        photoLatitude: item.photoLatitude,
        photoLongitude: item.photoLongitude,
        deviceLatitude: null,
        deviceLongitude: null,
      };
    }

    return {
      ...verifyPhotoLocation({
      photoLatitude: item.deviceLatitude,
      photoLongitude: item.deviceLongitude,
      locationSource: "BROWSER_GEOLOCATION",
      parkLatitude,
      parkLongitude,
      }),
      photoLatitude: null,
      photoLongitude: null,
      deviceLatitude: isValidLatitude(item.deviceLatitude) ? item.deviceLatitude : null,
      deviceLongitude: isValidLongitude(item.deviceLongitude) ? item.deviceLongitude : null,
    };
  });
}

export function readStoredPhotoLocationVerifications(
  value: unknown,
  photoCount: number
): StoredPhotoLocationVerification[] {
  if (photoCount <= 0) {
    return [];
  }

  const items = Array.isArray(value) ? value : [];

  return Array.from({ length: photoCount }, (_, index) =>
    normalizeStoredVerification(items[index])
  );
}

export type ParkGpsVerification = {
  pinned: { lat: number; lon: number };
  metadata: { lat: number; lon: number; photoIndex: number } | null;
  distanceMeters: number | null;
  status: PhotoLocationStatus;
  gpsPhotoCount: number;
  photos: Array<StoredPhotoLocationVerification & { photoIndex: number }>;
};

/** Chooses the closest EXIF coordinate while retaining every photo result for admin review. */
export function summarizeParkGpsVerification(
  value: unknown,
  photoCount: number,
  parkLatitude: number,
  parkLongitude: number
): ParkGpsVerification {
  const photos = readStoredPhotoLocationVerifications(value, photoCount).map(
    (photo, index) => ({ ...photo, photoIndex: index + 1 })
  );
  const gpsPhotos = photos.filter(
    (photo) => photo.locationSource === "PHOTO_EXIF" && photo.photoLatitude !== null && photo.photoLongitude !== null
  );
  const closest = gpsPhotos.reduce<(typeof gpsPhotos)[number] | null>((current, photo) => {
    if (!current) return photo;
    return (photo.locationDistanceMeters ?? Infinity) < (current.locationDistanceMeters ?? Infinity)
      ? photo
      : current;
  }, null);
  // Older records stored the verification result and distance but not the raw
  // EXIF coordinates. Keep that historical audit signal visible without
  // inventing coordinates that were never persisted.
  const legacyVerifiedPhoto = photos.find(
    (photo) => photo.locationStatus !== "NO_GPS_DATA"
  ) ?? null;
  const primary = closest ?? legacyVerifiedPhoto;

  return {
    pinned: { lat: parkLatitude, lon: parkLongitude },
    metadata: closest
      ? { lat: closest.photoLatitude as number, lon: closest.photoLongitude as number, photoIndex: closest.photoIndex }
      : null,
    distanceMeters: primary?.locationDistanceMeters ?? null,
    status: primary?.locationStatus ?? "NO_GPS_DATA",
    gpsPhotoCount: gpsPhotos.length,
    photos,
  };
}

export function formatPhotoLocationDistance(distanceMeters: number | null) {
  if (distanceMeters === null) {
    return "unknown distance";
  }

  if (distanceMeters < 1_000) {
    return `${distanceMeters.toLocaleString()} m`;
  }

  return `${(distanceMeters / 1_000).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })} km`;
}
