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
  const parkId = parsePositiveInteger(id);

  if (parkId === null) {
    return createJsonErrorResponse("Invalid park id.", 400);
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

  const rejectionReason =
    typeof body.rejectionReason === "string"
      ? body.rejectionReason.replace(/\s+/g, " ").trim()
      : null;

  try {
    const existingSubmission = await prisma.park.findFirst({
      where: {
        id: parkId,
        deletedAt: null,
        submissionStatus: "PENDING",
        submittedById: {
          not: null,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingSubmission) {
      return createJsonErrorResponse("Submission not found.", 404);
    }

    await prisma.park.update({
      where: {
        id: parkId,
      },
      data: {
        submissionStatus: body.status,
        reviewedAt: new Date(),
        rejectionReason:
          body.status === "REJECTED" ? rejectionReason || null : null,
      },
    });

    return NextResponse.json({
      success: true,
      status: body.status,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
