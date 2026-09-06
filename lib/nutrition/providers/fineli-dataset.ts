import { normalizeFoodQuery, validateNutrition, withChecksum } from "../normalization";
import type { ExternalFoodResult } from "../types";

type CsvRow = Record<string, string>;

export const FINELI_BASIC_PACKAGE_2_URL = "https://fineli.fi/fineli/content/file/49";

const NUTRIENT_CODES = {
  energyKj: new Set(["ENERC", "ENERGYKJ"]),
  fat: new Set(["FAT"]),
  protein: new Set(["PROT"]),
  carbohydrate: new Set(["CHOAVL"]),
  sugar: new Set(["SUGAR"]),
  saturatedFat: new Set(["FASAT", "FASATG"]),
  transFat: new Set(["FATRN"]),
  fiber: new Set(["FIBC"]),
  sodium: new Set(["NA"]),
  salt: new Set(["NACL", "SALT"]),
  cholesterol: new Set(["CHOLE"]),
  potassium: new Set(["K"]),
  calcium: new Set(["CA"]),
  iron: new Set(["FE"]),
};

const USEFUL_PORTIONS: Record<string, string> = {
  KPL_S: "Small piece",
  KPL_M: "Medium-sized piece",
  KPL_L: "Big piece",
  PORTS: "Small portion",
  PORTM: "Medium portion",
  PORTL: "Large portion",
  PORTTBL: "Standard portion",
  DL: "Decilitre",
  RKL: "Tablespoon",
  TL: "Teaspoon",
};

const EXCLUDED_PORTIONS = new Set(["PORT1000KJ", "KJ1000", "E1000KJ"]);

function canonicalHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function rowValue(row: CsvRow, ...names: string[]) {
  for (const name of names) {
    const value = row[canonicalHeader(name)];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

function decimal(value: string) {
  if (!value || /^N\/?A$/i.test(value)) return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized.startsWith("<") ? normalized.slice(1) : normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Parses the semicolon-delimited files after their documented ISO-8859-1 decoding. */
export function parseFineliCsv(input: string): CsvRow[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ";" && !quoted) {
      record.push(field); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(field); field = "";
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
    } else field += character;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const headers = (records.shift() ?? []).map(canonicalHeader);
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export type FineliDatasetFiles = {
  foodCsv: string;
  componentValueCsv: string;
  componentCsv?: string;
  foodAddUnitCsv?: string;
  foodNameEnCsv?: string;
  foodNameFiCsv?: string;
  foodNameSvCsv?: string;
  componentNameEnCsv?: string;
  datasetVersion?: string;
};

export type FineliDatasetRecord = ExternalFoodResult & {
  searchMetadata: NonNullable<ExternalFoodResult["searchMetadata"]> & { fineliType: "FOOD" | "DISH" };
};

function componentValues(rows: CsvRow[]) {
  const byFood = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const foodId = rowValue(row, "FOODID", "FOOD_ID");
    const component = rowValue(row, "EUFDNAME", "COMPONENT", "COMPONENTID").toUpperCase();
    const value = decimal(rowValue(row, "BESTLOC", "VALUE", "AMOUNT"));
    if (!foodId || !component || value === undefined) continue;
    const values = byFood.get(foodId) ?? new Map<string, number>();
    values.set(component, value);
    byFood.set(foodId, values);
  }
  return byFood;
}

function componentUnits(rows: CsvRow[]) {
  return new Map(rows.flatMap((row) => {
    const code = rowValue(row, "EUFDNAME", "COMPONENT", "COMPONENTID").toUpperCase();
    return code ? [[code, rowValue(row, "COMPUNIT", "UNIT").toUpperCase()] as const] : [];
  }));
}

function descriptions(rows: CsvRow[], key = "THSCODE") {
  return new Map(rows.flatMap((row) => {
    const code = rowValue(row, key).toUpperCase();
    const description = rowValue(row, "DESCRIPT", "DESCRIPTION", "FOODNAME");
    return code && description ? [[code, description] as const] : [];
  }));
}

function foodNames(csv?: string) {
  return new Map((csv ? parseFineliCsv(csv) : []).flatMap((row) => {
    const id = rowValue(row, "FOODID");
    const name = rowValue(row, "FOODNAME");
    return id && name ? [[id, name] as const] : [];
  }));
}

function displayName(value: string) {
  return value.toLocaleLowerCase("en").replace(/(^|[\s,(\-/])([a-zà-öø-ÿ])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("en")}`);
}

function nutrient(values: Map<string, number>, codes: Set<string>) {
  for (const code of codes) if (values.has(code)) return values.get(code);
  return undefined;
}

function portionsByFood(rows: CsvRow[]) {
  const result = new Map<string, ExternalFoodResult["servings"]>();
  for (const row of rows) {
    const foodId = rowValue(row, "FOODID", "FOOD_ID");
    const code = rowValue(row, "THSCODE", "UNIT", "UNITCODE", "FOODUNIT").toUpperCase();
    const grams = decimal(rowValue(row, "MASS", "GRAMS", "WEIGHT", "BESTLOC"));
    if (!foodId || !code || !grams || code === "G" || EXCLUDED_PORTIONS.has(code)) continue;
    const label = USEFUL_PORTIONS[code];
    if (!label) continue;
    const servings = result.get(foodId) ?? [];
    servings.push({ name: label, quantity: 1, grams, householdUnit: label.toLowerCase(), sourceExternalId: code });
    result.set(foodId, servings);
  }
  return result;
}

export function parseFineliBasicPackage(files: FineliDatasetFiles): FineliDatasetRecord[] {
  const foods = parseFineliCsv(files.foodCsv);
  const valuesByFood = componentValues(parseFineliCsv(files.componentValueCsv));
  const componentRows = files.componentCsv ? parseFineliCsv(files.componentCsv) : [];
  const units = componentUnits(componentRows);
  const componentNames = descriptions(files.componentNameEnCsv ? parseFineliCsv(files.componentNameEnCsv) : []);
  const portions = portionsByFood(files.foodAddUnitCsv ? parseFineliCsv(files.foodAddUnitCsv) : []);
  const namesEn = foodNames(files.foodNameEnCsv);
  const namesFi = foodNames(files.foodNameFiCsv);
  const namesSv = foodNames(files.foodNameSvCsv);

  return foods.flatMap((row) => {
    const id = rowValue(row, "FOODID", "FOOD_ID", "ID");
    const typeValue = rowValue(row, "FOODTYPE", "FOOD_TYPE", "TYPE").toUpperCase();
    const type = typeValue === "DISH" ? "DISH" : typeValue === "FOOD" ? "FOOD" : null;
    const englishName = namesEn.get(id) ?? rowValue(row, "ENFDNAME", "FOODNAMEEN", "NAMEEN", "ENGLISHNAME", "FOODNAME");
    const name = displayName(englishName);
    const values = valuesByFood.get(id);
    if (!id || !type || !name || !values) return [];
    const energyKj = nutrient(values, NUTRIENT_CODES.energyKj);
    const saltValue = nutrient(values, NUTRIENT_CODES.salt);
    const saltCode = [...NUTRIENT_CODES.salt].find((code) => values.has(code));
    const saltUnit = saltCode ? units.get(saltCode) : undefined;
    const nutritionPer100g = validateNutrition({
      caloriesKcal: energyKj === undefined ? undefined : energyKj / 4.184,
      proteinGrams: nutrient(values, NUTRIENT_CODES.protein),
      carbohydrateGrams: nutrient(values, NUTRIENT_CODES.carbohydrate),
      fatGrams: nutrient(values, NUTRIENT_CODES.fat),
      sugarGrams: nutrient(values, NUTRIENT_CODES.sugar),
      saturatedFatGrams: nutrient(values, NUTRIENT_CODES.saturatedFat),
      transFatGrams: nutrient(values, NUTRIENT_CODES.transFat),
      fiberGrams: nutrient(values, NUTRIENT_CODES.fiber),
      sodiumMg: nutrient(values, NUTRIENT_CODES.sodium),
      saltGrams: saltValue === undefined ? undefined : saltUnit === "MG" ? saltValue / 1000 : saltValue,
      cholesterolMg: nutrient(values, NUTRIENT_CODES.cholesterol),
      potassiumMg: nutrient(values, NUTRIENT_CODES.potassium),
      calciumMg: nutrient(values, NUTRIENT_CODES.calcium),
      ironMg: nutrient(values, NUTRIENT_CODES.iron),
    });
    const complete = [nutritionPer100g.caloriesKcal, nutritionPer100g.proteinGrams, nutritionPer100g.carbohydrateGrams, nutritionPer100g.fatGrams].every((value) => value !== undefined);
    if (!complete) return [];
    const preparation = rowValue(row, "PROCESS", "PREPMETH", "PREPARATIONMETHOD");
    const ingredientClass = rowValue(row, "IGCLASS", "INGREDIENTCLASS");
    const functionClass = rowValue(row, "FUCLASS", "FUNCTIONCLASS");
    const raw = {
      dataset: "Fineli Basic Package 2",
      datasetVersion: files.datasetVersion ?? null,
      id,
      type: { code: type },
      name: { en: namesEn.get(id) ?? null, fi: namesFi.get(id) ?? null, sv: namesSv.get(id) ?? null },
      preparationMethod: preparation ? [{ code: preparation }] : [],
      ingredientClass: ingredientClass ? [{ code: ingredientClass }] : [],
      functionClass: functionClass ? [{ code: functionClass }] : [],
      ediblePortion: decimal(rowValue(row, "EDPORT", "EDIBLEPORTION")),
      nutrients: Object.fromEntries(values),
    };
    const result = withChecksum({
      provider: "FINELI" as const,
      externalId: id,
      foodType: "GENERIC" as const,
      name,
      description: preparation || undefined,
      languageCode: "en",
      localizedNames: [
        ["en", namesEn.get(id)],
        ["fi", namesFi.get(id)],
        ["sv", namesSv.get(id)],
      ].flatMap(([languageCode, localizedName]) => localizedName
        ? [{ name: localizedName, languageCode }]
        : []),
      countryCodes: ["fi"],
      nutritionPer100g,
      servings: [{ name: "100 g", quantity: 100, grams: 100, householdUnit: "g", sourceExternalId: "G" }, ...(portions.get(id) ?? [])],
      confidenceScore: type === "FOOD" ? 0.96 : 0.9,
      verificationStatus: "OFFICIAL_SOURCE" as const,
      isComplete: true,
      providerVersion: files.datasetVersion,
      details: {
        categories: [ingredientClass, functionClass].filter(Boolean),
        labels: [type, preparation].filter(Boolean),
        allergens: [], traces: [], additives: [],
        nutrients: [...values.entries()].map(([code, amount]) => ({ nutrientKey: code.toLowerCase(), displayName: componentNames.get(code) ?? code, amount, unit: units.get(code)?.toLowerCase() ?? "unknown" })),
      },
      searchMetadata: { source: "FINELI" as const, isGeneric: type === "FOOD", isBranded: false, fineliType: type },
      raw,
    });
    return [{ ...result, searchMetadata: result.searchMetadata! as FineliDatasetRecord["searchMetadata"] }];
  });
}

export function searchFineliDataset(query: string, foods: readonly FineliDatasetRecord[], limit = 12) {
  const normalized = normalizeFoodQuery(query);
  const terms = normalized.split(" ").filter(Boolean);
  return foods
    .filter((food) => food.searchMetadata.fineliType === "FOOD")
    .filter((food) => {
      const names = [food.name, ...(food.localizedNames ?? []).map((entry) => entry.name)].map(normalizeFoodQuery);
      return terms.every((term) => names.some((name) => name.includes(term)));
    })
    .sort((left, right) => {
      const score = (food: FineliDatasetRecord) => Math.max(...[
        food.name,
        ...(food.localizedNames ?? []).map((entry) => entry.name),
      ].map(normalizeFoodQuery).map((name) =>
        (name === normalized ? 400 : name.startsWith(`${normalized} `) ? 250 : 0)
        + (/\baverage\b/.test(name) ? 160 : 0)
        - Math.max(0, name.length - normalized.length)
      ));
      return score(right) - score(left) || left.externalId.localeCompare(right.externalId);
    })
    .slice(0, limit);
}
