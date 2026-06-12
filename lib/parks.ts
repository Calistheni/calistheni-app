import { prisma } from "@/lib/prisma";

export async function getParks() {
  const parks = await prisma.park.findMany({
    include: {
      equipment: {
        include: {
          equipment: true,
        },
      },
    },
  });

  return parks.map((park) => ({
    id: park.id,
    name: park.name,
    title: park.title,
    lat: park.lat,
    lon: park.lon,
    address: park.address,
    equipment: park.equipment.map((relation) => relation.equipment.name),
  }));
}
