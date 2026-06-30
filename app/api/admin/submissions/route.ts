import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  try {
    const submissions = await prisma.park.findMany({
      where: {
        deletedAt: null,
        submissionStatus: "PENDING",
        submittedById: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        title: true,
        address: true,
        lat: true,
        lon: true,
        photoUrl: true,
        createdAt: true,
        submittedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        equipment: {
          include: {
            equipment: true,
          },
        },
      },
    });

    return NextResponse.json({
      count: submissions.length,
      submissions: submissions.map((submission) => ({
        ...submission,
        createdAt: submission.createdAt.toISOString(),
        equipment: submission.equipment.map((item) => item.equipment.name),
      })),
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
