import {
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { r2, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";

export const PENDING_PARK_PHOTO_PREFIX = "pending/parks/";
export const PARK_PHOTO_PREFIX = "parks/";

export type UploadedParkPhoto = {
  photoUrl: string;
  key: string | null;
};

function assertStorageConfigured() {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("Photo storage is not configured.");
  }
}

function encodeCopySourceKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function getParkPhotoUrlFromKey(key: string) {
  return `${R2_PUBLIC_URL}/${key}`;
}

export function getPermanentParkPhotoKey(key: string) {
  return key.startsWith(PENDING_PARK_PHOTO_PREFIX)
    ? key.replace(/^pending\//, "")
    : key;
}

export function isPendingParkPhotoKey(
  key: string | null | undefined
): key is string {
  return Boolean(key?.startsWith(PENDING_PARK_PHOTO_PREFIX));
}

export async function copyPendingParkPhotoToPermanent(
  photo: UploadedParkPhoto
): Promise<UploadedParkPhoto> {
  if (!photo.key || !isPendingParkPhotoKey(photo.key)) {
    return photo;
  }

  assertStorageConfigured();

  const permanentKey = getPermanentParkPhotoKey(photo.key);

  await r2.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: permanentKey,
      CopySource: `${R2_BUCKET_NAME}/${encodeCopySourceKey(photo.key)}`,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return {
    photoUrl: getParkPhotoUrlFromKey(permanentKey),
    key: permanentKey,
  };
}

export async function deleteR2Object(key: string) {
  assertStorageConfigured();

  await r2.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

export async function deletePendingParkPhotoKey(key: string | null | undefined) {
  if (!isPendingParkPhotoKey(key)) {
    return;
  }

  const pendingKey = key;

  try {
    await deleteR2Object(pendingKey);
  } catch (error) {
    console.error(
      `Unable to delete pending park photo object: ${pendingKey}`,
      error
    );
  }
}

export async function deletePendingParkPhotoKeys(keys: (string | null)[]) {
  await Promise.all(keys.map((key) => deletePendingParkPhotoKey(key)));
}
