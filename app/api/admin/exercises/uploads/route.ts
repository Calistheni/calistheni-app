import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createUniqueExerciseSlug } from "@/lib/exercises";
import {
  R2_ASSETS_BUCKET_NAME,
  getExerciseAssetPublicUrl,
  r2,
} from "@/lib/r2";

const uploadRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["thumbnail", "video"]),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

const THUMBNAIL_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return createJsonErrorResponse("Unauthorized", 401);
  }

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createJsonErrorResponse("Invalid thumbnail upload.", 400);
    }

    const name = formData.get("name");
    const file = formData.get("file");
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 120 ||
      !(file instanceof File)
    ) {
      return createJsonErrorResponse("Invalid thumbnail upload.", 400);
    }
    if (!THUMBNAIL_TYPES.has(file.type)) {
      return createJsonErrorResponse("Use a JPEG, PNG, or WebP thumbnail.", 400);
    }
    if (file.size <= 0 || file.size > MAX_THUMBNAIL_BYTES) {
      return createJsonErrorResponse(
        "The thumbnail must be 10 MB or smaller.",
        413
      );
    }
    if (!R2_ASSETS_BUCKET_NAME || !getExerciseAssetPublicUrl("test")) {
      return createJsonErrorResponse(
        "Exercise asset storage is not configured.",
        503
      );
    }

    try {
      const slug = await createUniqueExerciseSlug(name);
      const key = `exercises/${slug}/thumbnail.webp`;
      await r2.send(
        new PutObjectCommand({
          Bucket: R2_ASSETS_BUCKET_NAME,
          Key: key,
          Body: Buffer.from(await file.arrayBuffer()),
          ContentType: file.type,
        })
      );

      return Response.json({
        slug,
        key,
        publicUrl: getExerciseAssetPublicUrl(key),
      });
    } catch (error) {
      console.error(error);
      return createInternalServerErrorResponse();
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }
  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Invalid upload details.",
      parsed.error.flatten().fieldErrors
    );
  }

  const { name, kind, contentType, size } = parsed.data;
  const validType =
    kind === "thumbnail"
      ? THUMBNAIL_TYPES.has(contentType)
      : VIDEO_TYPES.has(contentType);
  const maxSize =
    kind === "thumbnail" ? MAX_THUMBNAIL_BYTES : MAX_VIDEO_BYTES;
  if (!validType) {
    return createJsonErrorResponse(
      kind === "thumbnail"
        ? "Use a JPEG, PNG, or WebP thumbnail."
        : "Use an MP4, WebM, or QuickTime video.",
      400
    );
  }
  if (size > maxSize) {
    return createJsonErrorResponse(
      kind === "thumbnail"
        ? "The thumbnail must be 10 MB or smaller."
        : "The video must be 150 MB or smaller.",
      413
    );
  }
  if (!R2_ASSETS_BUCKET_NAME || !getExerciseAssetPublicUrl("test")) {
    return createJsonErrorResponse(
      "Exercise asset storage is not configured.",
      503
    );
  }

  try {
    const slug = await createUniqueExerciseSlug(name);
    const key =
      kind === "thumbnail"
        ? `exercises/${slug}/thumbnail.webp`
        : `exercises/${slug}/video.mp4`;
    const uploadUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: R2_ASSETS_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 10 * 60 }
    );

    return Response.json({
      uploadUrl,
      slug,
      key,
      publicUrl: getExerciseAssetPublicUrl(key),
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
