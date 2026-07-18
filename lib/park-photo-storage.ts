import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  getParkPhotoR2Client,
  getParkPhotoR2Configuration,
} from "@/lib/r2";
import {
  validateParkPhotoBytes,
  validateParkPhotoMetadata,
} from "@/lib/park-photo-file";
import {
  getPermanentParkPhotoKey,
  isPendingParkPhotoKey,
  isPermanentParkPhotoKey,
  isSafeParkPhotoObjectKey,
  PARK_PHOTO_PREFIX,
  PENDING_PARK_PHOTO_PREFIX,
} from "@/lib/park-photo-keys";

export {
  getPermanentParkPhotoKey,
  isPendingParkPhotoKey,
  isPendingParkPhotoKeyForUser,
  isPermanentParkPhotoKey,
  PARK_PHOTO_PREFIX,
  PENDING_PARK_PHOTO_PREFIX,
} from "@/lib/park-photo-keys";

export type UploadedParkPhoto = {
  photoUrl: string;
  key: string;
};

function encodeCopySourceKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function getParkPhotoUrlFromKey(key: string) {
  if (!isSafeParkPhotoObjectKey(key)) {
    throw new Error("Invalid park photo object key.");
  }

  return `${getParkPhotoR2Configuration().publicUrl}/${key}`;
}

function createObjectKey({
  extension,
  owner,
  pending,
}: {
  extension: string;
  owner: string;
  pending: boolean;
}) {
  const safeOwner = owner.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  const prefix = pending ? PENDING_PARK_PHOTO_PREFIX : PARK_PHOTO_PREFIX;
  const key = `${prefix}${safeOwner}/${crypto.randomUUID()}.${extension}`;

  if (!isSafeParkPhotoObjectKey(key)) {
    throw new Error("Unable to generate a safe park photo object key.");
  }

  return key;
}

export async function uploadParkPhoto({
  file,
  owner,
  pending,
}: {
  file: File;
  owner: string;
  pending: boolean;
}): Promise<UploadedParkPhoto> {
  const metadata = validateParkPhotoMetadata(file);
  if (!metadata.success) {
    throw new Error(metadata.error);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateParkPhotoBytes(metadata, bytes);
  if (!validated.success) {
    throw new Error(validated.error);
  }

  const key = createObjectKey({
    extension: validated.extension,
    owner,
    pending,
  });
  const configuration = getParkPhotoR2Configuration();

  await getParkPhotoR2Client().send(
    new PutObjectCommand({
      Bucket: configuration.bucketName,
      Key: key,
      Body: bytes,
      ContentType: validated.contentType,
      CacheControl: pending
        ? "private, no-store"
        : "public, max-age=31536000, immutable",
      Metadata: {
        assetType: "park-photo",
        lifecycle: pending ? "pending" : "approved",
      },
    })
  );

  return { key, photoUrl: getParkPhotoUrlFromKey(key) };
}

export async function copyPendingParkPhotoToPermanent(
  photo: UploadedParkPhoto
): Promise<UploadedParkPhoto> {
  if (!isPendingParkPhotoKey(photo.key)) {
    throw new Error("Invalid pending park photo key.");
  }

  const configuration = getParkPhotoR2Configuration();
  const permanentKey = getPermanentParkPhotoKey(photo.key);
  const r2 = getParkPhotoR2Client();

  await r2.send(
    new CopyObjectCommand({
      Bucket: configuration.bucketName,
      Key: permanentKey,
      CopySource: `${configuration.bucketName}/${encodeCopySourceKey(photo.key)}`,
      CacheControl: "public, max-age=31536000, immutable",
      MetadataDirective: "REPLACE",
      Metadata: {
        assetType: "park-photo",
        lifecycle: "approved",
      },
    })
  );

  await r2.send(
    new HeadObjectCommand({
      Bucket: configuration.bucketName,
      Key: permanentKey,
    })
  );

  return {
    photoUrl: getParkPhotoUrlFromKey(permanentKey),
    key: permanentKey,
  };
}

export async function deleteParkPhotoObject(key: string) {
  if (!isPendingParkPhotoKey(key) && !isPermanentParkPhotoKey(key)) {
    throw new Error("Refusing to delete an invalid park photo object key.");
  }

  const configuration = getParkPhotoR2Configuration();
  await getParkPhotoR2Client().send(
    new DeleteObjectCommand({
      Bucket: configuration.bucketName,
      Key: key,
    })
  );
}

export async function tryDeletePendingParkPhotoKey(
  key: string | null | undefined
) {
  if (!isPendingParkPhotoKey(key)) {
    return true;
  }

  try {
    await deleteParkPhotoObject(key);
    return true;
  } catch (error) {
    console.error("Unable to delete pending park photo object.", {
      key,
      error: error instanceof Error ? error.message : "Unknown R2 error",
    });
    return false;
  }
}

export async function tryDeletePendingParkPhotoKeys(keys: (string | null)[]) {
  const results = await Promise.all(keys.map(tryDeletePendingParkPhotoKey));
  return results.every(Boolean);
}
