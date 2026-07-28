import { NextResponse } from "next/server";
import { getParkDetail, getPublicParks } from "@/lib/parks";
import { prisma } from "@/lib/prisma";
import {
  createUnauthorizedResponse,
  getAdminActorLabel,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  deleteParkPhotoObject,
  uploadParkPhoto,
  type UploadedParkPhoto,
} from "@/lib/park-photo-storage";
import { parkMutationSchema } from "@/lib/validation/parks";
import { PARK_PHOTO_MAX_FILE_SIZE } from "@/lib/park-photo-file";
import { getParkQrUpdateData } from "@/lib/park-qr";

const MAX_MULTIPART_REQUEST_SIZE = PARK_PHOTO_MAX_FILE_SIZE + 1024 * 1024;

export async function GET() {
  try {
    return NextResponse.json(await getPublicParks());
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

async function parseAdminCreateRequest(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return { body: await request.json(), photo: null };
  }

  const formData = await request.formData();
  const payload = formData.get("payload");
  const photo = formData.get("photo");
  if (typeof payload !== "string") {
    throw new Error("Invalid park payload.");
  }

  return {
    body: JSON.parse(payload) as unknown,
    photo: photo instanceof File && photo.size > 0 ? photo : null,
  };
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_MULTIPART_REQUEST_SIZE) {
    return createJsonValidationErrorResponse("Invalid park photo.", {
      photo: ["Image must be 15 MB or smaller."],
    });
  }

  let body: unknown;
  let photoFile: File | null;
  try {
    ({ body, photo: photoFile } = await parseAdminCreateRequest(request));
  } catch {
    return createJsonErrorResponse("Invalid park payload.", 400);
  }

  const parsedBody = parkMutationSchema.safeParse(body);
  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid park payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  let uploadedPhoto: UploadedParkPhoto | null = null;

  try {
    const actorLabel = await getAdminActorLabel();
    const now = new Date();
    const equipmentCount = await prisma.equipment.count({
      where: { id: { in: parsedBody.data.equipmentIds } },
    });
    if (equipmentCount !== new Set(parsedBody.data.equipmentIds).size) {
      return createJsonErrorResponse(
        "One or more equipment items were not found.",
        400
      );
    }

    if (photoFile) {
      uploadedPhoto = await uploadParkPhoto({
        file: photoFile,
        owner: "admin",
        pending: false,
      });
    }

    const park = await prisma.park.create({
      data: {
        name: parsedBody.data.name,
        title: parsedBody.data.title,
        address: parsedBody.data.address,
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,
        submissionStatus: "APPROVED",
        ...getParkQrUpdateData({
          nextStatus: parsedBody.data.qrStatus,
          note: parsedBody.data.qrCodeNote ?? null,
          actorLabel,
          now,
        }),
        photoUrl: uploadedPhoto?.photoUrl ?? null,
        photoKey: uploadedPhoto?.key ?? null,
        equipment: {
          create: parsedBody.data.equipmentIds.map((equipmentId) => ({
            equipmentId,
          })),
        },
        photos: uploadedPhoto
          ? {
              create: {
                url: uploadedPhoto.photoUrl,
                isPrimary: true,
              },
            }
          : undefined,
      },
    });

    return NextResponse.json(await getParkDetail(park.id), { status: 201 });
  } catch (error) {
    if (uploadedPhoto) {
      try {
        await deleteParkPhotoObject(uploadedPhoto.key);
      } catch (cleanupError) {
        console.error("Unable to roll back admin park photo upload.", {
          key: uploadedPhoto.key,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : "Unknown R2 error",
        });
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    if (
      message.includes("image") ||
      message.includes("file") ||
      message.includes("15 MB")
    ) {
      return createJsonValidationErrorResponse("Invalid park photo.", {
        photo: [message],
      });
    }

    console.error("Unable to create admin park.", { error: message });
    return createInternalServerErrorResponse();
  }
}
