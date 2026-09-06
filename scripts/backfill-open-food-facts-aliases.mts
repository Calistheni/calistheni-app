import { pathToFileURL } from "node:url";
import { prisma } from "../lib/prisma";
import { buildProviderFoodAliasCandidates } from "../lib/nutrition/provider-food-aliases";

export async function backfillOpenFoodFactsAliases(apply: boolean) {
  const foods = await prisma.food.findMany({
    where: { source: "OPEN_FOOD_FACTS" },
    select: {
      id: true,
      name: true,
      languageCode: true,
      aliases: { select: { normalizedName: true, name: true, languageCode: true } },
      sourceRecords: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: { rawData: true },
      },
    },
  });
  const report = {
    mode: apply ? "apply" : "dry-run",
    foodsScanned: foods.length,
    foodsWithStoredSourceData: 0,
    aliasesCreated: 0,
    aliasesUpdated: 0,
    aliasesUnchanged: 0,
  };

  for (const food of foods) {
    const rawData = food.sourceRecords[0]?.rawData;
    if (rawData) report.foodsWithStoredSourceData += 1;
    const candidates = buildProviderFoodAliasCandidates({
      provider: "OPEN_FOOD_FACTS",
      rawData,
      fallbackName: food.name,
      fallbackLanguageCode: food.languageCode,
    });
    const existing = new Map(food.aliases.map((alias) => [alias.normalizedName, alias]));

    for (const candidate of candidates) {
      const current = existing.get(candidate.normalizedName);
      if (!current) report.aliasesCreated += 1;
      else if (current.name !== candidate.name || current.languageCode !== candidate.languageCode) report.aliasesUpdated += 1;
      else {
        report.aliasesUnchanged += 1;
        continue;
      }
      if (!apply) continue;
      await prisma.foodAlias.upsert({
        where: {
          foodId_normalizedName: {
            foodId: food.id,
            normalizedName: candidate.normalizedName,
          },
        },
        create: { ...candidate, foodId: food.id, source: "OPEN_FOOD_FACTS" },
        update: { ...candidate, source: "OPEN_FOOD_FACTS" },
      });
    }
  }

  return report;
}

async function run() {
  const apply = process.argv.includes("--apply");
  try {
    console.info(await backfillOpenFoodFactsAliases(apply));
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await run();
}
