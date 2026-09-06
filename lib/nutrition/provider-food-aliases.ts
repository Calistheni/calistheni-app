import { foodSearchIndexKeys } from "./normalization";
import { buildOpenFoodFactsAliasCandidates, type FoodAliasCandidate } from "./open-food-facts-aliases";
import type { ExternalFoodResult } from "./types";

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return name && name.length <= 240 ? name : null;
}

export function extractFineliLocalizedNames(rawData: unknown) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return [];
  const name = "name" in rawData ? (rawData as { name?: unknown }).name : null;
  if (!name || typeof name !== "object" || Array.isArray(name)) return [];
  return Object.entries(name).flatMap(([languageCode, value]) => {
    const localizedName = cleanName(value);
    return localizedName ? [{ name: localizedName, languageCode: languageCode.toLocaleLowerCase() }] : [];
  });
}

function aliasesForNames(names: Array<{ name: string; languageCode?: string | null }>) {
  const aliases = new Map<string, FoodAliasCandidate>();
  for (const entry of names) {
    const name = cleanName(entry.name);
    if (!name) continue;
    for (const normalizedName of foodSearchIndexKeys(name)) {
      if (!aliases.has(normalizedName)) aliases.set(normalizedName, { name, normalizedName, languageCode: entry.languageCode ?? null });
    }
  }
  return [...aliases.values()];
}

/** One alias path for imports, provider syncs, and stored-source backfills. */
export function buildProviderFoodAliasCandidates({
  provider,
  rawData,
  fallbackName,
  fallbackLanguageCode,
}: {
  provider: ExternalFoodResult["provider"];
  rawData: unknown;
  fallbackName: string;
  fallbackLanguageCode?: string | null;
}) {
  if (provider === "OPEN_FOOD_FACTS") {
    return buildOpenFoodFactsAliasCandidates({ rawData, fallbackName, fallbackLanguageCode });
  }
  const localizedNames = provider === "FINELI" ? extractFineliLocalizedNames(rawData) : [];
  return aliasesForNames([
    { name: fallbackName, languageCode: fallbackLanguageCode },
    ...localizedNames,
  ]);
}
