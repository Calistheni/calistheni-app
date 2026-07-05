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
import { prisma } from "@/lib/prisma";

type SubmissionReviewPayload = {
  status?: unknown;
  rejectionReason?: unknown;
};

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
      ? body.rejectionReason.replace(/\s+/g, " ").trim()
      : null;

  try {
    if (submissionType === "park") {
      const existingSubmission = await prisma.park.findFirst({
        where: {
          id: submissionId,
          deletedAt: null,
          submissionStatus: "PENDING",
          submittedById: {
            not: null,
          },
        },
        select: {
          id: true,
          photoUrl: true,
          submittedById: true,
        },
      });

      if (!existingSubmission) {
        return createJsonErrorResponse("Submission not found.", 404);
      }

      await prisma.$transaction(async (tx) => {
        await tx.park.update({
          where: {
            id: submissionId,
          },
          data: {
            submissionStatus: reviewStatus,
            reviewedAt: new Date(),
            rejectionReason:
              reviewStatus === "REJECTED" ? rejectionReason || null : null,
          },
        });

        if (reviewStatus === "APPROVED" && existingSubmission.photoUrl) {
          await tx.parkPhoto.create({
            data: {
              parkId: submissionId,
              url: existingSubmission.photoUrl,
              uploadedById: existingSubmission.submittedById,
            },
          });
        }
      });

      return NextResponse.json({
        success: true,
        status: reviewStatus,
      });
    }

    const existingEdit = await prisma.parkEditSubmission.findFirst({
      where: {
        id: submissionId,
        status: "PENDING",
      },
      select: {
        id: true,
        parkId: true,
        submittedById: true,
        name: true,
        title: true,
        address: true,
        lat: true,
        lon: true,
        equipmentIds: true,
        photoUrls: true,
      },
    });

    if (!existingEdit) {
      return createJsonErrorResponse("Submission not found.", 404);
    }

    await prisma.$transaction(async (tx) => {
      if (reviewStatus === "APPROVED") {
        const park = await tx.park.findUnique({
          where: {
            id: existingEdit.parkId,
          },
          select: {
            photoUrl: true,
          },
        });
        const latestSubmittedPhotoUrl =
          existingEdit.photoUrls[existingEdit.photoUrls.length - 1] ?? null;

        await tx.park.update({
          where: {
            id: existingEdit.parkId,
          },
          data: {
            name: existingEdit.name,
            title: existingEdit.title,
            address: existingEdit.address,
            lat: existingEdit.lat,
            lon: existingEdit.lon,
            photoUrl: latestSubmittedPhotoUrl ?? park?.photoUrl ?? null,
          },
        });

        await tx.parkEquipment.deleteMany({
          where: {
            parkId: existingEdit.parkId,
          },
        });

        if (existingEdit.equipmentIds.length) {
          await tx.parkEquipment.createMany({
            data: existingEdit.equipmentIds.map((equipmentId) => ({
              parkId: existingEdit.parkId,
              equipmentId,
            })),
          });
        }

        if (existingEdit.photoUrls.length) {
          await tx.parkPhoto.createMany({
            data: existingEdit.photoUrls.map((photoUrl) => ({
              parkId: existingEdit.parkId,
              url: photoUrl,
              uploadedById: existingEdit.submittedById,
            })),
          });
        }
      }

      await tx.parkEditSubmission.update({
        where: {
          id: existingEdit.id,
        },
        data: {
          status: reviewStatus,
          reviewedAt: new Date(),
          rejectionReason:
            reviewStatus === "REJECTED" ? rejectionReason || null : null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      status: reviewStatus,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
