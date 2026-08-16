import "server-only";

import { createHash } from "node:crypto";
import { FoodContributionStatus, FoodDataValueSource, FoodFreshnessStatus, FoodImportStatus, FoodRevisionReason, FoodSource, FoodType, FoodVerificationStatus, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeBarcode, normalizeFoodQuery } from "./normalization";
import { nutritionSanityWarning } from "./missing-food-validation";
import { toFoodSummary } from "./service";
import { z } from "zod";

const nutrition = z.object({ caloriesKcal: z.number().min(0).max(2000), proteinGrams: z.number().min(0).max(200), carbohydrateGrams: z.number().min(0).max(300), fatGrams: z.number().min(0).max(200), fiberGrams: z.number().min(0).max(150).nullable().optional(), sugarGrams: z.number().min(0).max(300).nullable().optional(), saturatedFatGrams: z.number().min(0).max(200).nullable().optional(), sodiumMg: z.number().min(0).max(100000).nullable().optional() });
export const barcodeContributionSchema = z.object({ barcode: z.string().refine((value) => Boolean(normalizeBarcode(value)), "Invalid barcode"), productName: z.string().trim().min(2).max(160), brandName: z.string().trim().max(120).nullable().optional(), nutrition, servingGrams: z.number().min(1).max(2000).nullable().optional(), servingLabel: z.string().trim().min(1).max(80).nullable().optional(), method: z.enum(["MANUAL", "AI_LABEL"]).default("MANUAL"), warnings: z.array(z.string().trim().max(200)).max(8).default([]) }).strict();
export type BarcodeContribution = z.infer<typeof barcodeContributionSchema>;

export const labelExtractionSchema = z.object({ productName: z.string().nullable(), brandName: z.string().nullable(), servingSizeText: z.string().nullable(), servingGrams: z.number().positive().max(2000).nullable(), nutritionBasis: z.enum(["PER_100G", "PER_SERVING", "UNKNOWN"]), calories: z.number().min(0).max(2000).nullable(), proteinGrams: z.number().min(0).max(200).nullable(), carbsGrams: z.number().min(0).max(300).nullable(), fatGrams: z.number().min(0).max(200).nullable(), sugarGrams: z.number().min(0).max(300).nullable(), fiberGrams: z.number().min(0).max(150).nullable(), saturatedFatGrams: z.number().min(0).max(200).nullable(), sodiumMg: z.number().min(0).max(100000).nullable(), confidence: z.number().min(0).max(1), warnings: z.array(z.string().max(200)).max(8) }).strict();
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;
export function labelExtractionToContribution(extraction: LabelExtraction) {
  if (extraction.nutritionBasis === "UNKNOWN") throw new Error("LABEL_BASIS_UNKNOWN");
  if (extraction.nutritionBasis === "PER_SERVING" && !extraction.servingGrams) throw new Error("SERVING_GRAMS_REQUIRED");
  const scale = extraction.nutritionBasis === "PER_SERVING" ? 100 / extraction.servingGrams! : 1;
  const value = (number: number | null) => number === null ? null : Math.round(number * scale * 1000) / 1000;
  return { nutrition: { caloriesKcal: value(extraction.calories), proteinGrams: value(extraction.proteinGrams), carbohydrateGrams: value(extraction.carbsGrams), fatGrams: value(extraction.fatGrams), fiberGrams: value(extraction.fiberGrams), sugarGrams: value(extraction.sugarGrams), saturatedFatGrams: value(extraction.saturatedFatGrams), sodiumMg: value(extraction.sodiumMg) }, servingGrams: extraction.servingGrams, servingLabel: extraction.servingSizeText };
}

export function barcodeNutritionWarning(value: BarcodeContribution["nutrition"]) { return nutritionSanityWarning({ nutrition: { ...value, fiberGrams: value.fiberGrams ?? null, sugarGrams: value.sugarGrams ?? null, saturatedFatGrams: value.saturatedFatGrams ?? null, sodiumMg: value.sodiumMg ?? null } } as never); }

const barcodeFoodInclude = { aliases: { select: { name: true } }, details: { select: { categories: true, productImageUrl: true } }, servings: { select: { name: true, quantity: true, grams: true, householdUnit: true, isDefault: true } } } as const;

function canReuseBarcodeFood(food: { type: FoodType; contributionStatus: FoodContributionStatus | null; createdByUserId: string | null }, userId: string) {
  return food.type !== FoodType.USER_CREATED || food.contributionStatus === "APPROVED" || (food.contributionStatus === "PENDING" && food.createdByUserId === userId);
}

export async function saveBarcodeContribution(userId: string, input: BarcodeContribution) {
  const barcode = normalizeBarcode(input.barcode)!;
  const existing = await prisma.food.findUnique({ where: { barcode }, include: barcodeFoodInclude });
  // A pending proposal belongs only to its creator. Never disclose another
  // user's unverified nutrition simply because they scanned the same code.
  if (existing && canReuseBarcodeFood(existing, userId)) return { kind: "existing" as const, food: toFoodSummary(existing) };
  const checksum = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  try {
    const food = await prisma.$transaction(async (tx) => {
      // Recheck inside the write transaction to close lookup/save races.
      const raced = await tx.food.findUnique({ where: { barcode } });
      if (raced) throw new Error("BARCODE_EXISTS");
      const sourceExternalId = `community-barcode:${barcode}`;
      const created = await tx.food.create({ data: { type: FoodType.USER_CREATED, name: input.productName, normalizedName: normalizeFoodQuery(input.productName), brandName: input.brandName ?? null, barcode, nutritionBasisGrams: 100, ...input.nutrition, calorieValueSource: FoodDataValueSource.MANUAL, source: FoodSource.USER, sourceExternalId, verificationStatus: FoodVerificationStatus.UNVERIFIED, importStatus: FoodImportStatus.ACTIVE, freshnessStatus: FoodFreshnessStatus.FRESH, confidenceScore: input.method === "AI_LABEL" ? .7 : .65, contributionStatus: "PENDING", createdByUserId: userId } });
      const proposal = { kind: "BARCODE_PRODUCT", method: input.method, barcode, productName: input.productName, brandName: input.brandName ?? null, nutrition: input.nutrition, servingGrams: input.servingGrams ?? null, servingLabel: input.servingLabel ?? null, warnings: input.warnings };
      const sourceRecord = await tx.foodSourceRecord.create({ data: { foodId: created.id, source: FoodSource.USER, sourceExternalId, rawData: proposal as Prisma.InputJsonValue, checksum, responseStatus: 201 } });
      const revision = await tx.foodRevision.create({ data: { foodId: created.id, revisionNumber: 1, reason: FoodRevisionReason.USER_CORRECTION, source: FoodSource.USER, sourceExternalId, name: input.productName, brandName: input.brandName ?? null, barcode, nutritionBasisGrams: 100, ...input.nutrition, confidenceScore: input.method === "AI_LABEL" ? .7 : .65, verificationStatus: FoodVerificationStatus.UNVERIFIED, sourceRecordId: sourceRecord.id, normalizedDataChecksum: checksum, createdByUserId: userId } });
      await tx.food.update({ where: { id: created.id }, data: { currentRevisionId: revision.id } });
      await tx.foodAlias.create({ data: { foodId: created.id, name: input.productName, normalizedName: normalizeFoodQuery(input.productName), source: FoodSource.USER } });
      if (input.servingGrams) await tx.foodServing.create({ data: { foodId: created.id, name: input.servingLabel ?? "Serving", grams: input.servingGrams, isDefault: true, source: FoodSource.USER } });
      return tx.food.findUniqueOrThrow({ where: { id: created.id }, include: barcodeFoodInclude });
    });
    return { kind: "created" as const, food: { ...toFoodSummary(food), isOwnContribution: true }, warning: barcodeNutritionWarning(input.nutrition) };
  } catch (error) {
    if (error instanceof Error && error.message === "BARCODE_EXISTS" || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.food.findUnique({ where: { barcode }, include: barcodeFoodInclude });
      if (raced && canReuseBarcodeFood(raced, userId)) {
        if (process.env.NODE_ENV === "development") console.info("[Barcode] creator-visible pending match reused", { barcode, foodId: raced.id });
        return { kind: "existing" as const, food: toFoodSummary(raced) };
      }
      return { kind: "raced" as const };
    }
    throw error;
  }
}
