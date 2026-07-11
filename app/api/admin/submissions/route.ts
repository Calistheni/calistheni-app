import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { readStoredPhotoLocationVerifications } from "@/lib/photo-location-verification";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  try {
    const [newParkSubmissions, editSubmissions] = await Promise.all([
      prisma.park.findMany({
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
          photoLocationVerifications: true,
          nearbyParkWarning: true,
          closestNearbyParkId: true,
          closestNearbyParkDistanceMeters: true,
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
      }),
      prisma.parkEditSubmission.findMany({
        where: {
          status: "PENDING",
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          park: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
          submittedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const editEquipmentIds = [
      ...new Set(editSubmissions.flatMap((submission) => submission.equipmentIds)),
    ];
    const editEquipment = editEquipmentIds.length
      ? await prisma.equipment.findMany({
          where: {
            id: {
              in: editEquipmentIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
    const equipmentById = new Map(
      editEquipment.map((item) => [item.id, item.name])
    );
    const closestNearbyParkIds = newParkSubmissions
      .map((submission) => submission.closestNearbyParkId)
      .filter((parkId): parkId is number => typeof parkId === "number");
    const closestNearbyParks = closestNearbyParkIds.length
      ? await prisma.park.findMany({
          where: {
            id: {
              in: closestNearbyParkIds,
            },
          },
          select: {
            id: true,
            name: true,
            title: true,
          },
        })
      : [];
    const closestNearbyParkById = new Map(
      closestNearbyParks.map((park) => [park.id, park])
    );

    const submissions = [
      ...newParkSubmissions.map((submission) => ({
        reviewId: `park-${submission.id}`,
        kind: "NEW_PARK" as const,
        id: submission.id,
        parkId: null,
        originalParkName: null,
        originalParkAddress: null,
        name: submission.name,
        title: submission.title,
        address: submission.address,
        lat: submission.lat,
        lon: submission.lon,
        photoUrls: submission.photoUrl ? [submission.photoUrl] : [],
        photoLocationVerifications: readStoredPhotoLocationVerifications(
          submission.photoLocationVerifications,
          submission.photoUrl ? 1 : 0
        ),
        nearbyParkWarning: submission.nearbyParkWarning,
        closestNearbyPark: submission.closestNearbyParkId
          ? closestNearbyParkById.get(submission.closestNearbyParkId) ?? null
          : null,
        closestNearbyParkDistanceMeters:
          submission.closestNearbyParkDistanceMeters,
        createdAt: submission.createdAt.toISOString(),
        submittedBy: submission.submittedBy,
        equipment: submission.equipment.map((item) => item.equipment.name),
      })),
      ...editSubmissions.map((submission) => ({
        reviewId: `edit-${submission.id}`,
        kind: "PARK_EDIT" as const,
        id: submission.id,
        parkId: submission.parkId,
        originalParkName: submission.park.name,
        originalParkAddress: submission.park.address,
        name: submission.name,
        title: submission.title,
        address: submission.address,
        lat: submission.lat,
        lon: submission.lon,
        photoUrls: submission.photoUrls,
        photoLocationVerifications: readStoredPhotoLocationVerifications(
          submission.photoLocationVerifications,
          submission.photoUrls.length
        ),
        nearbyParkWarning: false,
        closestNearbyPark: null,
        closestNearbyParkDistanceMeters: null,
        createdAt: submission.createdAt.toISOString(),
        submittedBy: submission.submittedBy,
        equipment: submission.equipmentIds
          .map((equipmentId) => equipmentById.get(equipmentId))
          .filter((item): item is string => Boolean(item)),
      })),
    ].sort(
      (first, second) =>
        new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
    );

    return NextResponse.json({
      count: submissions.length,
      submissions,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
