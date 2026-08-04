import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import {
  copyPendingParkPhotoToPermanent,
  deleteParkPhotoObject,
  isPendingParkPhotoKey,
  tryDeletePendingParkPhotoKey,
  tryDeletePendingParkPhotoKeys,
  type UploadedParkPhoto,
} from "@/lib/park-photo-storage";
import { prisma } from "@/lib/prisma";

type SubmissionReviewPayload = {
  status?: unknown;
  rejectionReason?: unknown;
};

async function rollBackPromotedPhotos(photos: UploadedParkPhoto[]) {
  await Promise.all(
    photos.map(async (photo) => {
      try {
        await deleteParkPhotoObject(photo.key);
      } catch (error) {
        console.error("Unable to roll back promoted park photo.", {
          key: photo.key,
          error: error instanceof Error ? error.message : "Unknown R2 error",
        });
      }
    })
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  const { id } = await params;
  const [submissionType, rawSubmissionId] = id.split("-");
  const submissionId = parsePositiveInteger(rawSubmissionId ?? "");

  if (
    submissionId === null ||
    (submissionType !== "park" && submissionType !== "edit")
  ) {
    return createJsonErrorResponse("Invalid submission id.", 400);
  }

  let body: SubmissionReviewPayload;
  try {
    body = (await request.json()) as SubmissionReviewPayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  if (body.status !== "APPROVED" && body.status !== "REJECTED") {
    return createJsonErrorResponse("Invalid submission status.", 400);
  }

  const reviewStatus = body.status;
  const rejectionReason =
    typeof body.rejectionReason === "string"
      ? body.rejectionReason.replace(/\s+/g, " ").trim().slice(0, 500)
      : null;

  try {
    if (submissionType === "park") {
      const submission = await prisma.park.findFirst({
        where: {
          id: submissionId,
          deletedAt: null,
          submittedById: { not: null },
        },
        select: {
          id: true,
          submissionStatus: true,
          photoUrl: true,
          photoKey: true,
          submittedById: true,
        },
      });

      if (!submission) {
        return createJsonErrorResponse("Submission not found.", 404);
      }

      if (submission.submissionStatus !== "PENDING") {
        const cleanupComplete =
          submission.submissionStatus === "REJECTED"
            ? await tryDeletePendingParkPhotoKey(submission.photoKey)
            : true;
        return NextResponse.json({
          success: true,
          status: submission.submissionStatus,
          alreadyProcessed: true,
          cleanupDeferred: !cleanupComplete,
        });
      }

      if (reviewStatus === "REJECTED") {
        await prisma.park.update({
          where: { id: submission.id },
          data: {
            submissionStatus: "REJECTED",
            reviewedAt: new Date(),
            rejectionReason: rejectionReason || null,
          },
        });
        const cleanupComplete = await tryDeletePendingParkPhotoKey(
          submission.photoKey
        );

        return NextResponse.json({
          success: true,
          status: "REJECTED",
          cleanupDeferred: !cleanupComplete,
        });
      }

      let approvedPhoto: UploadedParkPhoto | null = null;
      if (submission.photoUrl && isPendingParkPhotoKey(submission.photoKey)) {
        approvedPhoto = await copyPendingParkPhotoToPermanent({
          photoUrl: submission.photoUrl,
          key: submission.photoKey,
        });
      }

      try {
        await prisma.$transaction(async (tx) => {
          const finalPhotoUrl = approvedPhoto?.photoUrl ?? submission.photoUrl;
          await tx.park.update({
            where: { id: submission.id },
            data: {
              submissionStatus: "APPROVED",
              photoUrl: finalPhotoUrl,
              photoKey: approvedPhoto?.key ?? submission.photoKey,
              reviewedAt: new Date(),
              rejectionReason: null,
            },
          });

          if (finalPhotoUrl) {
            await tx.parkPhoto.updateMany({
              where: { parkId: submission.id },
              data: { isPrimary: false },
            });
            await tx.parkPhoto.create({
              data: {
                parkId: submission.id,
                url: finalPhotoUrl,
                uploadedById: submission.submittedById,
                isPrimary: true,
              },
            });
          }
        });
      } catch (error) {
        if (approvedPhoto) {
          await rollBackPromotedPhotos([approvedPhoto]);
        }
        throw error;
      }

      const cleanupComplete = await tryDeletePendingParkPhotoKey(
        submission.photoKey
      );
      return NextResponse.json({
        success: true,
        status: "APPROVED",
        cleanupDeferred: !cleanupComplete,
      });
    }

    const submission = await prisma.parkEditSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        parkId: true,
        submittedById: true,
        name: true,
        title: true,
        address: true,
        lat: true,
        lon: true,
        equipmentIds: true,
        photoUrls: true,
        photoKeys: true,
        photoLocationVerifications: true,
      },
    });

    if (!submission) {
      return createJsonErrorResponse("Submission not found.", 404);
    }

    if (submission.status !== "PENDING") {
      const cleanupComplete =
        submission.status === "REJECTED"
          ? await tryDeletePendingParkPhotoKeys(submission.photoKeys)
          : true;
      return NextResponse.json({
        success: true,
        status: submission.status,
        alreadyProcessed: true,
        cleanupDeferred: !cleanupComplete,
      });
    }

    if (reviewStatus === "REJECTED") {
      await prisma.parkEditSubmission.update({
        where: { id: submission.id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || null,
        },
      });
      const cleanupComplete = await tryDeletePendingParkPhotoKeys(
        submission.photoKeys
      );
      return NextResponse.json({
        success: true,
        status: "REJECTED",
        cleanupDeferred: !cleanupComplete,
      });
    }

    const approvedPhotos: UploadedParkPhoto[] = [];
    try {
      for (const [index, photoUrl] of submission.photoUrls.entries()) {
        const photoKey = submission.photoKeys[index];
        if (!photoKey || !isPendingParkPhotoKey(photoKey)) {
          throw new Error("The submission contains an invalid pending photo.");
        }
        approvedPhotos.push(
          await copyPendingParkPhotoToPermanent({ photoUrl, key: photoKey })
        );
      }

      const approvedPhotoUrls = approvedPhotos.map((photo) => photo.photoUrl);
      await prisma.$transaction(async (tx) => {
        const [park, currentPrimaryPhoto] = await Promise.all([
          tx.park.findUnique({
            where: { id: submission.parkId },
            select: { photoUrl: true, photoKey: true },
          }),
          tx.parkPhoto.findFirst({
            where: {
              parkId: submission.parkId,
              hiddenAt: null,
              isPrimary: true,
            },
            select: { url: true },
          }),
        ]);
        const promoteNewest = !currentPrimaryPhoto && approvedPhotos.length > 0;
        const primaryPhoto = promoteNewest
          ? approvedPhotos[approvedPhotos.length - 1]
          : null;

        await tx.park.update({
          where: { id: submission.parkId },
          data: {
            name: submission.name,
            title: submission.title,
            address: submission.address,
            lat: submission.lat,
            lon: submission.lon,
            photoUrl:
              currentPrimaryPhoto?.url ??
              primaryPhoto?.photoUrl ??
              park?.photoUrl ??
              null,
            photoKey: primaryPhoto?.key ?? park?.photoKey ?? null,
            photoLocationVerifications: submission.photoLocationVerifications ?? undefined,
          },
        });

        await tx.parkEquipment.deleteMany({
          where: { parkId: submission.parkId },
        });
        if (submission.equipmentIds.length) {
          await tx.parkEquipment.createMany({
            data: submission.equipmentIds.map((equipmentId) => ({
              parkId: submission.parkId,
              equipmentId,
            })),
          });
        }

        if (approvedPhotoUrls.length) {
          const primaryIndex = approvedPhotoUrls.length - 1;
          await tx.parkPhoto.createMany({
            data: approvedPhotoUrls.map((photoUrl, index) => ({
              parkId: submission.parkId,
              url: photoUrl,
              uploadedById: submission.submittedById,
              isPrimary: promoteNewest && index === primaryIndex,
            })),
          });
        }

        await tx.parkEditSubmission.update({
          where: { id: submission.id },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            rejectionReason: null,
          },
        });
      });
    } catch (error) {
      await rollBackPromotedPhotos(approvedPhotos);
      throw error;
    }

    const cleanupComplete = await tryDeletePendingParkPhotoKeys(
      submission.photoKeys
    );
    return NextResponse.json({
      success: true,
      status: "APPROVED",
      cleanupDeferred: !cleanupComplete,
    });
  } catch (error) {
    console.error("Unable to review park submission.", {
      submissionId,
      submissionType,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return createInternalServerErrorResponse();
  }
}
