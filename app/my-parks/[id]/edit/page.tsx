import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ParkSubmissionForm } from "@/components/user/ParkSubmissionForm";
import { parsePositiveInteger } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Edit Submitted Park",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function EditSubmittedParkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const parkId = parsePositiveInteger(id);

  if (parkId === null) {
    notFound();
  }

  const [park, equipment] = await Promise.all([
    prisma.park.findFirst({
      where: {
        id: parkId,
        submittedById: session.user.id,
        deletedAt: null,
      },
      include: {
        equipment: true,
      },
    }),
    prisma.equipment.findMany({
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  if (!park) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <ParkSubmissionForm
        equipment={equipment}
        mode="edit"
        parkId={park.id}
        initialValues={{
          name: park.name,
          title: park.title ?? "",
          address: park.address ?? "",
          lat: String(park.lat),
          lon: String(park.lon),
          equipmentIds: park.equipment.map((item) => item.equipmentId),
        }}
      />
    </main>
  );
}
