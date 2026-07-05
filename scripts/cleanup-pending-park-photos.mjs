import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const PENDING_PREFIX = "pending/parks/";
const maxAgeDays = Number(process.env.PENDING_PARK_PHOTO_MAX_AGE_DAYS ?? "7");
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const bucketName = process.env.R2_BUCKET_NAME ?? "";
const endpoint = process.env.R2_ENDPOINT ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";

if (!bucketName || !endpoint || !accessKeyId || !secretAccessKey) {
  console.error(
    "Missing R2 configuration. Required: R2_BUCKET_NAME, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY."
  );
  process.exit(1);
}

if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
  console.error("PENDING_PARK_PHOTO_MAX_AGE_DAYS must be a positive number.");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
let continuationToken;
let scannedCount = 0;
let deletedCount = 0;

console.info(
  `Cleaning pending park photos older than ${maxAgeDays} days under ${PENDING_PREFIX}.`
);

if (dryRun) {
  console.info("DRY_RUN enabled. No objects will be deleted.");
}

do {
  const page = await r2.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: PENDING_PREFIX,
      ContinuationToken: continuationToken,
    })
  );
  const staleObjects = (page.Contents ?? []).filter((object) => {
    scannedCount += 1;

    return (
      object.Key?.startsWith(PENDING_PREFIX) &&
      object.LastModified &&
      object.LastModified.getTime() < cutoff
    );
  });

  if (staleObjects.length) {
    console.info(
      `Found ${staleObjects.length} stale pending park photo object(s).`
    );

    if (!dryRun) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: staleObjects.map((object) => ({
              Key: object.Key,
            })),
            Quiet: true,
          },
        })
      );
    }

    deletedCount += staleObjects.length;
  }

  continuationToken = page.NextContinuationToken;
} while (continuationToken);

console.info(
  `Scanned ${scannedCount} pending object(s). ${
    dryRun ? "Would delete" : "Deleted"
  } ${deletedCount}.`
);

// Suggested cron usage later:
// PENDING_PARK_PHOTO_MAX_AGE_DAYS=7 node --env-file=.env.local scripts/cleanup-pending-park-photos.mjs
