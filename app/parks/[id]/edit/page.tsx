import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ParkSubmissionForm } from "@/components/user/ParkSubmissionForm";
import { parsePositiveInteger } from "@/lib/api-response";
import { publicParkWhere } from "@/lib/parks";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Suggest Park Edit",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SuggestParkEditPage({
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
        ...publicParkWhere,
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
        mode="suggest-edit"
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
