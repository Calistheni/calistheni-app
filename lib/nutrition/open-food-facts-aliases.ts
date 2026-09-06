import { foodSearchIndexKeys } from "./normalization";
import { extractOpenFoodFactsAliases } from "./providers/open-food-facts";

export type FoodAliasCandidate = {
  name: string;
  normalizedName: string;
  languageCode: string | null;
};

/** Builds the same deterministic, deduplicated aliases used by live imports. */
export function buildOpenFoodFactsAliasCandidates({
  rawData,
  fallbackName,
  fallbackLanguageCode,
}: {
  rawData: unknown;
  fallbackName: string;
  fallbackLanguageCode?: string | null;
}) {
  const aliases = new Map<string, FoodAliasCandidate>();
  for (const alias of [
    { name: fallbackName, languageCode: fallbackLanguageCode ?? undefined },
    ...extractOpenFoodFactsAliases(rawData),
  ]) {
    const name = alias.name.normalize("NFKC").trim().replace(/\s+/g, " ");
    for (const normalizedName of foodSearchIndexKeys(name)) {
      if (aliases.has(normalizedName)) continue;
      aliases.set(normalizedName, {
        name,
        normalizedName,
        languageCode: alias.languageCode ?? null,
      });
    }
  }
  return [...aliases.values()];
}
