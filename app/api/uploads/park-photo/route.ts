import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { r2, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function getExtension(file: File) {
  const type = file.type;
  const name = file.name.toLowerCase();

  if (
    type === "image/jpeg" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  ) {
    return "jpg";
  }

  if (type === "image/png" || name.endsWith(".png")) {
    return "png";
  }

  if (type === "image/webp" || name.endsWith(".webp")) {
    return "webp";
  }

  if (type === "image/heic" || name.endsWith(".heic")) {
    return "heic";
  }

  if (type === "image/heif" || name.endsWith(".heif")) {
    return "heif";
  }

  return "jpg";
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    return NextResponse.json(
      { error: "Photo storage is not configured." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  console.log("UPLOAD DEBUG", {
    isFile: file instanceof File,
    type: file instanceof File ? file.type : null,
    size: file instanceof File ? file.size : null,
    name: file instanceof File ? file.name : null,
  });

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();

  const isAllowed =
    ALLOWED_TYPES.has(file.type) ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif");

  if (!isAllowed) {
    return NextResponse.json(
      {
        error: `Unsupported image. Type="${file.type}", Name="${file.name}"`,
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `Image is too large (${(file.size / 1024 / 1024).toFixed(
          2
        )} MB). Maximum is 5 MB.`,
      },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const extension = getExtension(file);

  const key = `parks/${session.user.id}/${crypto.randomUUID()}.${extension}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return NextResponse.json({
    photoUrl: `${R2_PUBLIC_URL}/${key}`,
    key,
  });
}
