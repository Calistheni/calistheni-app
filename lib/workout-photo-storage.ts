import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { isWorkoutPhotoKey } from "@/lib/workout-photo";

let client: S3Client | undefined;

function workoutPhotoStorage() {
  const bucket = process.env.WORKOUT_PHOTO_R2_BUCKET_NAME?.trim();
  const endpoint = process.env.WORKOUT_PHOTO_R2_ENDPOINT?.trim();
  const accessKeyId = process.env.WORKOUT_PHOTO_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.WORKOUT_PHOTO_R2_SECRET_ACCESS_KEY?.trim();
  const sharedBuckets = ["calistheni-photos", process.env.PARK_PHOTO_R2_BUCKET_NAME?.trim(), process.env.R2_BUCKET_NAME?.trim()];
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey || sharedBuckets.includes(bucket)) {
    throw new Error("Private workout photo storage is not configured.");
  }
  if (!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/.test(endpoint)) {
    throw new Error("Invalid workout photo R2 API endpoint.");
  }
  client ??= new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  return { bucket, client };
}

export async function putWorkoutPhoto(key: string, bytes: Uint8Array) {
  if (!isWorkoutPhotoKey(key)) throw new Error("Invalid workout photo object key.");
  const { bucket, client } = workoutPhotoStorage();
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp",
    CacheControl: "private, no-store", Metadata: { assetType: "workout-photo", compression: "webp-q86-max2048" },
  }));
  // A successful PutObject is followed by a HEAD so development logging and the
  // database record never claim an object exists when it did not reach R2.
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteWorkoutPhotoObject(key: string) {
  if (!isWorkoutPhotoKey(key)) throw new Error("Refusing to delete an invalid workout photo object key.");
  const { bucket, client } = workoutPhotoStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getWorkoutPhotoObject(key: string) {
  if (!isWorkoutPhotoKey(key)) throw new Error("Invalid workout photo object key.");
  const { bucket, client } = workoutPhotoStorage();
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}
