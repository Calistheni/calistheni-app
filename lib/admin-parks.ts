import "server-only";

import {
  getParkVisibilityWhere,
  getParkBoundsWhere,
} from "@/lib/park-map-query";
import { latestParkPhotoQuery } from "@/lib/parks";
import { summarizeParkGpsVerification } from "@/lib/photo-location-verification";
import { prisma } from "@/lib/prisma";
import type {
  AdminParkDetail,
  AdminParkMapSummary,
  AdminParkQrCounts,
  ParkArchiveStatus,
  ParkQrStatus,
  ParkViewportBounds,
} from "@/types/park";

const adminMapSelect = {
  id: true,
  name: true,
  title: true,
  lat: true,
  lon: true,
  address: true,
  photoUrl: true,
  updatedAt: true,
  deletedAt: true,
  submissionStatus: true,
  qrStatus: true,
  photos: latestParkPhotoQuery,
  _count: {
    select: {
      equipment: true,
    },
  },
};

function getAdminParkWhere(
  qrStatus: ParkQrStatus | "ALL",
  archiveStatus: ParkArchiveStatus = "ACTIVE"
) {
  return {
    ...getParkVisibilityWhere(archiveStatus),
    ...(qrStatus === "ALL" ? {} : { qrStatus }),
  };
}

function mapAdminParkSummary(
  park: Awaited<
    ReturnType<typeof prisma.park.findMany<{ select: typeof adminMapSelect }>>
  >[number]
): AdminParkMapSummary {
  return {
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    photoUrl: park.photos[0]?.url ?? park.photoUrl,
    updatedAt: park.updatedAt.toISOString(),
    deletedAt: park.deletedAt?.toISOString() ?? null,
    qrStatus: park.qrStatus,
    equipmentCount: park._count.equipment,
    submissionStatus: park.submissionStatus,
  };
}

export async function getAdminParksInBounds({
  bounds,
  limit,
  qrStatus,
  archiveStatus,
}: {
  bounds: ParkViewportBounds;
  limit: number;
  qrStatus: ParkQrStatus | "ALL";
  archiveStatus: ParkArchiveStatus;
}) {
  const parks = await prisma.park.findMany({
    where: {
      AND: [
        getAdminParkWhere(qrStatus, archiveStatus),
        getParkBoundsWhere(bounds),
      ],
    },
    select: adminMapSelect,
    orderBy: { id: "asc" },
    take: limit,
  });

  return parks.map(mapAdminParkSummary);
}

export async function searchAdminParks({
  query,
  qrStatus,
  archiveStatus,
  cursor,
  limit,
}: {
  query: string;
  qrStatus: ParkQrStatus | "ALL";
  archiveStatus: ParkArchiveStatus;
  cursor: number | null;
  limit: number;
}) {
  const normalizedQuery = query.trim();
  const parks = await prisma.park.findMany({
    where: {
      AND: [
        getAdminParkWhere(qrStatus, archiveStatus),
        ...(normalizedQuery.length >= 2
          ? [
              {
                OR: [
                  { name: { contains: normalizedQuery, mode: "insensitive" as const } },
                  {
                    address: {
                      contains: normalizedQuery,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    select: adminMapSelect,
    orderBy: { id: "desc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
  });
  const hasNextPage = parks.length > limit;
  const page = parks.slice(0, limit);

  return {
    parks: page.map(mapAdminParkSummary),
    nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
  };
}

export async function getAdminParkQrCounts({
  archiveStatus = "ACTIVE",
  qrStatus = "ALL",
}: {
  archiveStatus?: ParkArchiveStatus;
  qrStatus?: ParkQrStatus | "ALL";
} = {}): Promise<AdminParkQrCounts> {
  const rows = await prisma.park.groupBy({
    by: ["qrStatus"],
    where: getAdminParkWhere(qrStatus, archiveStatus),
    _count: { _all: true },
  });
  const countByStatus = new Map(
    rows.map((row) => [row.qrStatus, row._count._all])
  );
  const installed = countByStatus.get("INSTALLED") ?? 0;
  const notInstalled = countByStatus.get("NOT_INSTALLED") ?? 0;
  const needsReplacement = countByStatus.get("NEEDS_REPLACEMENT") ?? 0;

  return {
    total: installed + notInstalled + needsReplacement,
    installed,
    notInstalled,
    needsReplacement,
  };
}

export async function getAdminParkDetail(
  parkId: number
): Promise<AdminParkDetail | null> {
  const park = await prisma.park.findFirst({
    // An authenticated admin lookup is intentionally not a public-visibility
    // lookup: it must return active, rejected, and soft-deleted parks.
    where: { id: parkId },
    include: {
      equipment: {
        include: { equipment: true },
      },
      photos: latestParkPhotoQuery,
      submittedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });
  if (!park) return null;

  return {
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    photoUrl: park.photos[0]?.url ?? park.photoUrl,
    updatedAt: park.updatedAt.toISOString(),
    deletedAt: park.deletedAt?.toISOString() ?? null,
    equipment: park.equipment.map((item) => item.equipment.name),
    submissionStatus: park.submissionStatus,
    qrStatus: park.qrStatus,
    qrInstalledAt: park.qrInstalledAt?.toISOString() ?? null,
    qrInstalledByLabel: park.qrInstalledByLabel,
    qrStatusUpdatedAt: park.qrStatusUpdatedAt?.toISOString() ?? null,
    qrCodeNote: park.qrCodeNote,
    submission: {
      source: park.submittedBy ? "USER_SUBMISSION" : "UNKNOWN_LEGACY_SOURCE",
      submittedAt: park.createdAt.toISOString(),
      submitter: park.submittedBy,
    },
    gpsVerification: summarizeParkGpsVerification(
      park.photoLocationVerifications,
      Array.isArray(park.photoLocationVerifications) ? park.photoLocationVerifications.length : 0,
      park.lat,
      park.lon
    ),
  };
}
