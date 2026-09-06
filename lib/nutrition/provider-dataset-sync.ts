import {
  FoodDataValueSource,
  FoodFreshnessStatus,
  FoodImportStatus,
  FoodRevisionReason,
  FoodSource,
  FoodType,
  FoodVerificationStatus,
  Prisma,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeFoodQuery } from "./normalization";
import { buildProviderFoodAliasCandidates } from "./provider-food-aliases";
import type { ExternalFoodResult } from "./types";

function foodData(result: ExternalFoodResult) {
  const type = result.searchMetadata?.fineliType === "DISH" ? FoodType.RECIPE : result.foodType === "GENERIC" ? FoodType.GENERIC : FoodType.BRANDED;
  return {
    type,
    name: result.name,
    normalizedName: normalizeFoodQuery(result.name),
    description: result.description ?? null,
    brandName: result.brandName ?? null,
    barcode: result.barcode ?? null,
    imageUrl: result.imageUrl ?? null,
    languageCode: result.languageCode ?? null,
    countryCodes: result.countryCodes,
    nutritionBasisGrams: 100,
    ...result.nutritionPer100g,
    calorieValueSource: FoodDataValueSource.PROVIDER,
    source: FoodSource.FINELI,
    sourceExternalId: result.externalId,
    sourceUpdatedAt: result.sourceUpdatedAt ?? null,
    verificationStatus: FoodVerificationStatus.OFFICIAL_SOURCE,
    importStatus: result.isComplete ? FoodImportStatus.ACTIVE : FoodImportStatus.INCOMPLETE,
    freshnessStatus: FoodFreshnessStatus.FRESH,
    confidenceScore: result.confidenceScore,
    lastFetchedAt: new Date(),
    lastRevalidatedAt: new Date(),
    nextRevalidateAt: null,
  };
}

function revisionData(foodId: string, revisionNumber: number, result: ExternalFoodResult, sourceRecordId: string, reason: FoodRevisionReason) {
  return {
    foodId,
    revisionNumber,
    reason,
    source: FoodSource.FINELI,
    sourceExternalId: result.externalId,
    name: result.name,
    brandName: result.brandName ?? null,
    barcode: result.barcode ?? null,
    imageUrl: result.imageUrl ?? null,
    nutritionBasisGrams: 100,
    ...result.nutritionPer100g,
    confidenceScore: result.confidenceScore,
    verificationStatus: FoodVerificationStatus.OFFICIAL_SOURCE,
    sourceUpdatedAt: result.sourceUpdatedAt ?? null,
    sourceRecordId,
    normalizedDataChecksum: result.checksum,
  };
}

async function replaceRelatedData(tx: Prisma.TransactionClient, foodId: string, result: ExternalFoodResult) {
  await tx.foodServing.deleteMany({ where: { foodId, source: FoodSource.FINELI } });
  if (result.servings.length) await tx.foodServing.createMany({ data: result.servings.map((serving, index) => ({ foodId, name: serving.name, quantity: serving.quantity, grams: serving.grams, householdUnit: serving.householdUnit ?? null, isDefault: index === 0, source: FoodSource.FINELI, sourceExternalId: serving.sourceExternalId ?? null })) });
  const aliases = buildProviderFoodAliasCandidates({ provider: "FINELI", rawData: result.raw, fallbackName: result.name, fallbackLanguageCode: result.languageCode });
  for (const alias of aliases) {
    await tx.foodAlias.upsert({ where: { foodId_normalizedName: { foodId, normalizedName: alias.normalizedName } }, create: { foodId, ...alias, source: FoodSource.FINELI }, update: { ...alias, source: FoodSource.FINELI } });
  }
  if (!result.details) return;
  const details = result.details;
  await tx.foodDetails.upsert({
    where: { foodId },
    create: { foodId, categories: details.categories, labels: details.labels, allergens: [], traces: [], additives: [] },
    update: { categories: details.categories, labels: details.labels },
  });
  await tx.foodNutrient.deleteMany({ where: { foodId, source: FoodSource.FINELI } });
  if (details.nutrients.length) await tx.foodNutrient.createMany({ data: details.nutrients.map((nutrient) => ({ foodId, ...nutrient, basisGrams: 100, source: FoodSource.FINELI, sourceExternalId: result.externalId })) });
}

/** Idempotently materializes an official provider dataset record into canonical food tables. */
export async function syncFineliDatasetFood(result: ExternalFoodResult) {
  if (result.provider !== "FINELI") throw new Error("Fineli dataset sync received a non-Fineli record.");
  const existing = await prisma.food.findUnique({
    where: { source_sourceExternalId: { source: FoodSource.FINELI, sourceExternalId: result.externalId } },
    include: { currentRevision: true },
  });
  if (existing?.currentRevision?.normalizedDataChecksum === result.checksum) return { status: "UNCHANGED" as const, foodId: existing.id };
  return prisma.$transaction(async (tx) => {
    const food = existing ?? await tx.food.create({ data: foodData(result) });
    const sourceRecord = await tx.foodSourceRecord.create({ data: { foodId: food.id, source: FoodSource.FINELI, sourceExternalId: result.externalId, rawData: result.raw as Prisma.InputJsonValue, checksum: result.checksum, sourceUpdatedAt: result.sourceUpdatedAt ?? null, sourceVersion: result.providerVersion ?? null, responseStatus: 200 } });
    const revisionNumber = existing
      ? ((await tx.foodRevision.aggregate({ where: { foodId: food.id }, _max: { revisionNumber: true } }))._max.revisionNumber ?? 0) + 1
      : 1;
    const revision = await tx.foodRevision.create({ data: revisionData(food.id, revisionNumber, result, sourceRecord.id, existing ? FoodRevisionReason.PROVIDER_UPDATE : FoodRevisionReason.INITIAL_IMPORT) });
    await tx.food.update({ where: { id: food.id }, data: { ...foodData(result), currentRevisionId: revision.id } });
    await replaceRelatedData(tx, food.id, result);
    return { status: existing ? "UPDATED" as const : "CREATED" as const, foodId: food.id };
  }, { maxWait: 30_000, timeout: 120_000 });
}
