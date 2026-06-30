import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { parkMutationSchema } from "@/lib/validation/parks";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

function getFormString(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value : "";
}

function getPhotoValidationError(formData: FormData) {
  const photo = formData.get("photo");

  if (!(photo instanceof File) || photo.size === 0) {
    return null;
  }

  if (!photo.type.startsWith("image/")) {
    return "Photo must be an image.";
  }

  if (photo.size > MAX_PHOTO_SIZE_BYTES) {
    return "Photo must be 5MB or smaller.";
  }

  return null;
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return createJsonErrorResponse("Invalid form payload.", 400);
  }

  const parsedBody = parkMutationSchema.safeParse({
    name: getFormString(formData, "name"),
    title: getFormString(formData, "title"),
    address: getFormString(formData, "address"),
    lat: getFormString(formData, "lat"),
    lon: getFormString(formData, "lon"),
    equipmentIds: formData.getAll("equipmentIds"),
  });

  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid park payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  const photoError = getPhotoValidationError(formData);

  if (photoError) {
    return createJsonValidationErrorResponse("Invalid photo.", {
      photo: [photoError],
    });
  }

  try {
    const park = await prisma.park.create({
      data: {
        name: parsedBody.data.name,
        title: parsedBody.data.title,
        address: parsedBody.data.address,
        lat: parsedBody.data.lat,
        lon: parsedBody.data.lon,
        submissionStatus: "PENDING",
        submittedById: userId,
        // TODO: Store the validated camera image in object storage and save its URL here.
        photoUrl: null,
        equipment: {
          create: parsedBody.data.equipmentIds.map((equipmentId) => ({
            equipmentId,
          })),
        },
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json(
      {
        id: park.id,
        status: "PENDING",
        message: "Park submitted for admin review.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
