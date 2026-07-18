import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

export type ParkPhotoR2Configuration = {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
};

let client: S3Client | null = null;

function value(primary: string | undefined, legacy: string | undefined) {
  return primary?.trim() || legacy?.trim() || "";
}

export function getParkPhotoR2Configuration(): ParkPhotoR2Configuration {
  const configuration = {
    bucketName: value(
      process.env.PARK_PHOTO_R2_BUCKET_NAME,
      process.env.R2_BUCKET_NAME
    ),
    endpoint: value(process.env.PARK_PHOTO_R2_ENDPOINT, process.env.R2_ENDPOINT),
    accessKeyId: value(
      process.env.PARK_PHOTO_R2_ACCESS_KEY_ID,
      process.env.R2_ACCESS_KEY_ID
    ),
    secretAccessKey: value(
      process.env.PARK_PHOTO_R2_SECRET_ACCESS_KEY,
      process.env.R2_SECRET_ACCESS_KEY
    ),
    publicUrl: value(
      process.env.PARK_PHOTO_R2_PUBLIC_URL,
      process.env.R2_PUBLIC_URL
    ).replace(/\/+$/, ""),
  };

  const missing = Object.entries(configuration)
    .filter(([, configuredValue]) => !configuredValue)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(
      `Park photo R2 storage is not configured (${missing.join(", ")}).`
    );
  }

  for (const [label, url] of [
    ["endpoint", configuration.endpoint],
    ["publicUrl", configuration.publicUrl],
  ] as const) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        throw new Error();
      }
    } catch {
      throw new Error(`Park photo R2 ${label} is invalid.`);
    }
  }

  return configuration;
}

export function getParkPhotoR2Client() {
  const configuration = getParkPhotoR2Configuration();

  client ??= new S3Client({
    region: "auto",
    endpoint: configuration.endpoint,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });

  return client;
}
