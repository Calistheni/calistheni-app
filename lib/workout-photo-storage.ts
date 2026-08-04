import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getParkPhotoR2Client, getParkPhotoR2Configuration } from "@/lib/r2";
import { isWorkoutPhotoKey } from "@/lib/workout-photo";

export async function putWorkoutPhoto(key: string, bytes: Uint8Array) {
  if (!isWorkoutPhotoKey(key)) throw new Error("Invalid workout photo object key.");
  const config = getParkPhotoR2Configuration();
  await getParkPhotoR2Client().send(new PutObjectCommand({
    Bucket: config.bucketName, Key: key, Body: bytes, ContentType: "image/webp",
    CacheControl: "private, max-age=31536000, immutable", Metadata: { assetType: "workout-photo", compression: "webp-q86-max2048" },
  }));
  // A successful PutObject is followed by a HEAD so development logging and the
  // database record never claim an object exists when it did not reach R2.
  await getParkPhotoR2Client().send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
  if (process.env.NODE_ENV === "development") console.info("Workout photo stored in R2", { bucket: config.bucketName, key });
}

export async function deleteWorkoutPhotoObject(key: string) {
  if (!isWorkoutPhotoKey(key)) throw new Error("Refusing to delete an invalid workout photo object key.");
  const config = getParkPhotoR2Configuration();
  await getParkPhotoR2Client().send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}

export async function getWorkoutPhotoObject(key: string) {
  if (!isWorkoutPhotoKey(key)) throw new Error("Invalid workout photo object key.");
  const config = getParkPhotoR2Configuration();
  return getParkPhotoR2Client().send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
}
