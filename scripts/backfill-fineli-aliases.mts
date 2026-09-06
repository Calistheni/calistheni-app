import { pathToFileURL } from "node:url";
import { prisma } from "../lib/prisma";
import { buildProviderFoodAliasCandidates } from "../lib/nutrition/provider-food-aliases";

export async function backfillFineliAliases(apply: boolean) {
  const foods = await prisma.food.findMany({
    where: { source: "FINELI" },
    select: {
      id: true,
      name: true,
      languageCode: true,
      aliases: { select: { normalizedName: true, name: true, languageCode: true } },
      sourceRecords: { orderBy: { fetchedAt: "desc" }, take: 1, select: { rawData: true } },
    },
  });
  const report = { mode: apply ? "apply" : "dry-run", foodsScanned: foods.length, foodsWithStoredSourceData: 0, aliasesCreated: 0, aliasesUpdated: 0, aliasesUnchanged: 0 };
  const creates: Array<{ foodId: string; name: string; normalizedName: string; languageCode: string | null; source: "FINELI" }> = [];
  for (const food of foods) {
    const rawData = food.sourceRecords[0]?.rawData;
    if (rawData) report.foodsWithStoredSourceData += 1;
    const candidates = buildProviderFoodAliasCandidates({ provider: "FINELI", rawData, fallbackName: food.name, fallbackLanguageCode: food.languageCode });
    const existing = new Map(food.aliases.map((alias) => [alias.normalizedName, alias]));
    for (const candidate of candidates) {
      const current = existing.get(candidate.normalizedName);
      if (!current) { report.aliasesCreated += 1; creates.push({ ...candidate, foodId: food.id, source: "FINELI" }); }
      else { report.aliasesUnchanged += 1; }
    }
  }
  if (apply) {
    for (let index = 0; index < creates.length; index += 500) {
      await prisma.foodAlias.createMany({ data: creates.slice(index, index + 500), skipDuplicates: true });
    }
  }
  return report;
}

async function run() {
  try { console.info(await backfillFineliAliases(process.argv.includes("--apply"))); }
  finally { await prisma.$disconnect(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await run();
