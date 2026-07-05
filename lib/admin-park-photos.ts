import { prisma } from "@/lib/prisma";

export type AdminParkPhoto = {
  id: number;
  url: string;
  isPrimary: boolean;
  isHidden: boolean;
  hiddenAt: string | null;
  createdAt: string;
  uploadedBy: {
    name: string | null;
    email: string | null;
  } | null;
};

export async function getAdminParkPhotos(
  parkId: number
): Promise<AdminParkPhoto[]> {
  const photos = await prisma.parkPhoto.findMany({
    where: {
      parkId,
    },
    orderBy: [
      { isPrimary: "desc" },
      { hiddenAt: "asc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: {
      id: true,
      url: true,
      isPrimary: true,
      hiddenAt: true,
      createdAt: true,
      uploadedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    isPrimary: photo.isPrimary,
    isHidden: Boolean(photo.hiddenAt),
    hiddenAt: photo.hiddenAt?.toISOString() ?? null,
    createdAt: photo.createdAt.toISOString(),
    uploadedBy: photo.uploadedBy,
  }));
}
