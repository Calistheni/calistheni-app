import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
export const R2_ASSETS_BUCKET_NAME =
  process.env.R2_ASSETS_BUCKET_NAME ?? R2_BUCKET_NAME;
export const R2_ASSETS_PUBLIC_URL = (
  process.env.NEXT_PUBLIC_ASSETS_URL ?? R2_PUBLIC_URL
).replace(/\/$/, "");

export function getExerciseAssetPublicUrl(key: string) {
  return R2_ASSETS_PUBLIC_URL ? `${R2_ASSETS_PUBLIC_URL}/${key}` : "";
}
