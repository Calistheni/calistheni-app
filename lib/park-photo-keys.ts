export const PENDING_PARK_PHOTO_PREFIX = "pending/parks/";
export const PARK_PHOTO_PREFIX = "parks/";

export function isSafeParkPhotoObjectKey(key: string) {
  return (
    key.length > 0 &&
    key.length <= 512 &&
    !key.startsWith("/") &&
    !key.includes("..") &&
    /^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(key)
  );
}

export function isPendingParkPhotoKey(
  key: string | null | undefined
): key is string {
  return Boolean(
    key &&
      isSafeParkPhotoObjectKey(key) &&
      key.startsWith(PENDING_PARK_PHOTO_PREFIX)
  );
}

export function isPendingParkPhotoKeyForUser(key: string, userId: string) {
  return (
    isPendingParkPhotoKey(key) &&
    key.startsWith(`${PENDING_PARK_PHOTO_PREFIX}${userId}/`)
  );
}

export function isPermanentParkPhotoKey(
  key: string | null | undefined
): key is string {
  return Boolean(
    key &&
      isSafeParkPhotoObjectKey(key) &&
      key.startsWith(PARK_PHOTO_PREFIX)
  );
}

export function getPermanentParkPhotoKey(key: string) {
  if (!isPendingParkPhotoKey(key)) {
    throw new Error("Only pending park photos can be promoted.");
  }

  return `${PARK_PHOTO_PREFIX}${key.slice(PENDING_PARK_PHOTO_PREFIX.length)}`;
}
