import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import parksData from "../data/parks.json";
import type { Park } from "../types/park";

const parks = parksData as Park[];

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

const CHUNK_SIZE = 5000;
const startedAt = Date.now();

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${mins}m ${secs}s`;
}

async function main() {
  console.log(`Loading ${parks.length} parks...`);

  // 1. Collect unique equipment
  const equipmentNames = [...new Set(parks.flatMap((p) => p.equipment))].sort();

  console.log(`Equipment types: ${equipmentNames.length}`);

  // 2. Insert equipment
  await prisma.equipment.createMany({
    data: equipmentNames.map((name) => ({ name })),
    skipDuplicates: true,
  });

  console.log("Equipment imported");

  // 3. Insert parks in chunks
  for (let i = 0; i < parks.length; i += CHUNK_SIZE) {
    const chunk = parks.slice(i, i + CHUNK_SIZE);

    await prisma.park.createMany({
      data: chunk.map((park) => ({
        id: park.id,
        name: park.name,
        title: park.title,
        lat: park.lat,
        lon: park.lon,
        address: park.address,
      })),
      skipDuplicates: true,
    });

    const processed = Math.min(i + CHUNK_SIZE, parks.length);
    const elapsed = Date.now() - startedAt;

    const avgMsPerPark = elapsed / processed;
    const remaining = parks.length - processed;
    const etaMs = remaining * avgMsPerPark;

    console.log(
      `[PARKS] ${processed}/${parks.length} | ` +
        `Elapsed: ${formatDuration(elapsed)} | ` +
        `ETA: ${formatDuration(etaMs)}`
    );
  }

  // 4. Load equipment IDs
  const equipmentRows = await prisma.equipment.findMany();

  const equipmentMap = new Map(equipmentRows.map((e) => [e.name, e.id]));

  // 5. Build relations
  const relations: {
    parkId: number;
    equipmentId: number;
  }[] = [];

  for (const park of parks) {
    for (const equipmentName of park.equipment) {
      const equipmentId = equipmentMap.get(equipmentName);

      if (!equipmentId) continue;

      relations.push({
        parkId: park.id,
        equipmentId,
      });
    }
  }

  console.log(`Relations: ${relations.length}`);

  // 6. Insert relations in chunks
  const relationsStartedAt = Date.now();

  for (let i = 0; i < relations.length; i += CHUNK_SIZE) {
    await prisma.parkEquipment.createMany({
      data: relations.slice(i, i + CHUNK_SIZE),
      skipDuplicates: true,
    });

    const processed = Math.min(i + CHUNK_SIZE, relations.length);
    const elapsed = Date.now() - relationsStartedAt;

    const avgMsPerRelation = elapsed / processed;
    const remaining = relations.length - processed;
    const etaMs = remaining * avgMsPerRelation;

    console.log(
      `[RELATIONS] ${processed}/${relations.length} | ` +
        `Elapsed: ${formatDuration(elapsed)} | ` +
        `ETA: ${formatDuration(etaMs)}`
    );
  }

  const totalElapsed = Date.now() - startedAt;

  console.log("");
  console.log("Import complete");
  console.log(`Total time: ${formatDuration(totalElapsed)}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
