import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadParkPhoto } from "@/lib/park-photo-storage";
import { PARK_PHOTO_MAX_FILE_SIZE } from "@/lib/park-photo-file";

const MAX_MULTIPART_REQUEST_SIZE = PARK_PHOTO_MAX_FILE_SIZE + 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_MULTIPART_REQUEST_SIZE) {
    return NextResponse.json(
      { error: "Image must be 15 MB or smaller." },
      { status: 413 }
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Unable to parse park photo upload form data.", error);
    return NextResponse.json(
      { error: "Unable to read the uploaded photo. Please try again." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo was uploaded." }, { status: 400 });
  }

  try {
    const uploaded = await uploadParkPhoto({
      file,
      owner: session.user.id,
      pending: true,
    });

    return NextResponse.json(uploaded);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload this photo.";
    const isValidationError =
      message.includes("image") ||
      message.includes("file") ||
      message.includes("15 MB");

    if (!isValidationError) {
      console.error("Unable to upload pending park photo.", {
        userId: session.user.id,
        error: message,
      });
    }

    return NextResponse.json(
      {
        error: isValidationError
          ? message
          : "Photo upload is temporarily unavailable. Please try again.",
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
