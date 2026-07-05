import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { getAdminParkPhotos } from "@/lib/admin-park-photos";
import { getParkDetail } from "@/lib/parks";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type PhotoActionPayload = {
  action?: unknown;
};

type PhotoAction = "SET_PRIMARY" | "HIDE" | "RESTORE";

async function syncPrimaryPhoto(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  parkId: number,
  preferredPhotoId?: number
) {
  const preferredPhoto = preferredPhotoId
    ? await tx.parkPhoto.findFirst({
        where: {
          id: preferredPhotoId,
          parkId,
          hiddenAt: null,
        },
        select: {
          id: true,
          url: true,
        },
      })
    : null;

  const fallbackPhoto =
    preferredPhoto ??
    (await tx.parkPhoto.findFirst({
      where: {
        parkId,
        hiddenAt: null,
      },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: {
        id: true,
        url: true,
      },
    }));

  await tx.parkPhoto.updateMany({
    where: {
      parkId,
    },
    data: {
      isPrimary: false,
    },
  });

  if (fallbackPhoto) {
    await tx.parkPhoto.update({
      where: {
        id: fallbackPhoto.id,
      },
      data: {
        isPrimary: true,
      },
    });
  }

  await tx.park.update({
    where: {
      id: parkId,
    },
    data: {
      photoUrl: fallbackPhoto?.url ?? null,
    },
  });
}

function parsePhotoAction(value: unknown): PhotoAction | null {
  if (value === "SET_PRIMARY" || value === "HIDE" || value === "RESTORE") {
    return value;
  }

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  const { id, photoId } = await params;
  const parkId = parsePositiveInteger(id);
  const parsedPhotoId = parsePositiveInteger(photoId);

  if (parkId === null || parsedPhotoId === null) {
    return createJsonErrorResponse("Invalid park photo id.", 400);
  }

  let body: PhotoActionPayload;

  try {
    body = (await request.json()) as PhotoActionPayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const action = parsePhotoAction(body.action);

  if (!action) {
    return createJsonErrorResponse("Invalid photo action.", 400);
  }

  try {
    const photo = await prisma.parkPhoto.findFirst({
      where: {
        id: parsedPhotoId,
        parkId,
        park: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
      },
    });

    if (!photo) {
      return createJsonErrorResponse("Photo not found.", 404);
    }

    await prisma.$transaction(async (tx) => {
      if (action === "SET_PRIMARY") {
        await tx.parkPhoto.update({
          where: {
            id: parsedPhotoId,
          },
          data: {
            hiddenAt: null,
          },
        });
        await syncPrimaryPhoto(tx, parkId, parsedPhotoId);
        return;
      }

      if (action === "HIDE") {
        await tx.parkPhoto.update({
          where: {
            id: parsedPhotoId,
          },
          data: {
            hiddenAt: new Date(),
            isPrimary: false,
          },
        });
        await syncPrimaryPhoto(tx, parkId);
        return;
      }

      await tx.parkPhoto.update({
        where: {
          id: parsedPhotoId,
        },
        data: {
          hiddenAt: null,
        },
      });
      await syncPrimaryPhoto(tx, parkId);
    });

    return NextResponse.json({
      park: await getParkDetail(parkId),
      photos: await getAdminParkPhotos(parkId),
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
