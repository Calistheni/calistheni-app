import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalizeFoodQuery } from "./normalization";

const ICON_DIRECTORY = join(process.cwd(), "public", "food-icons");
const IMAGE_FILE = /\.(png|jpe?g|webp|svg)$/i;
const GENERATED_SUFFIX = /(?:[-_]\d{5,}|\s+\d{5,})$/;
const REPEATED_EXPORT_SUFFIX = /\s+\d+(?:\s+\d+)+$/;
const SINGLE_EXPORT_SUFFIX = /\s+\d+$/;
const DESCRIPTORS = new Set([
  "raw",
  "cooked",
  "grilled",
  "boiled",
  "baked",
  "roasted",
  "skinless",
  "boneless",
  "fresh",
  "frozen",
  "organic",
  "plain",
  "whole",
  "low-fat",
  "reduced-fat",
  "unsalted",
  "salted",
]);

export type FoodIcon = {
  key: string;
  url: string;
  filename: string;
  match: "EXPLICIT" | "EXACT" | "ALIAS" | "KEYWORD" | "CATEGORY";
};

type FoodIconCandidate = {
  name: string;
  aliases?: readonly string[];
  categories?: readonly string[];
  imageUrl?: string | null;
  iconKey?: string | null;
  type?: string | null;
  source?: string | null;
};

type IconInventory = {
  byKey: Map<string, { key: string; filename: string }>;
  directoryMtimeMs?: number;
};

let cachedInventory: IconInventory | undefined;

/**
 * Returns the logical asset key, independent of a design-tool export suffix.
 *
 * `apple_1147564 1 1.png`, `Apple 1.png`, and `apple.png` all resolve to
 * `apple`. The original filename is still retained for the public URL.
 */
export function normalizeFoodIconKey(value: string) {
  const basename = value
    .replace(IMAGE_FILE, "")
    // Figma/export duplicates frequently append ` 1 1`; remove that before
    // removing a long asset-library identifier such as `_1147564`.
    .replace(REPEATED_EXPORT_SUFFIX, "")
    .replace(GENERATED_SUFFIX, "")
    // A final space-separated number is an export duplicate (`Apple 1`), not
    // an intrinsic part of this icon library's food identity. Hyphenated and
    // underscored numeric food names are deliberately left alone.
    .replace(SINGLE_EXPORT_SUFFIX, "");

  return normalizeFoodQuery(basename)
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inventory(): IconInventory {
  let directoryMtimeMs: number | undefined;
  if (process.env.NODE_ENV === "development") {
    try {
      directoryMtimeMs = statSync(ICON_DIRECTORY).mtimeMs;
    } catch {
      // Keep the generic placeholder if the optional asset directory is absent.
    }
  }

  // Production inventory is immutable for a server process. In development,
  // re-scan after files are replaced so Turbopack hot reload does not retain
  // an obsolete filename map.
  //test
  if (
    cachedInventory &&
    (process.env.NODE_ENV !== "development" ||
      cachedInventory.directoryMtimeMs === directoryMtimeMs)
  )
    return cachedInventory;

  const byKey = new Map<string, { key: string; filename: string }>();
  try {
    for (const filename of readdirSync(ICON_DIRECTORY)) {
      if (!IMAGE_FILE.test(filename)) continue;
      const basename = filename.replace(IMAGE_FILE, "");
      const fullKey = normalizeFoodIconKey(filename);
      if (!fullKey) continue;
      const icon = { key: fullKey, filename };
      byKey.set(fullKey, icon);
      // Icon libraries frequently append an asset-library numeric id. Expose
      // the meaningful name as an additional lookup key without hardcoding it.
      const withoutGeneratedSuffix = normalizeFoodIconKey(
        basename.replace(GENERATED_SUFFIX, "")
      );
      if (withoutGeneratedSuffix && !byKey.has(withoutGeneratedSuffix))
        byKey.set(withoutGeneratedSuffix, icon);
    }
  } catch {
    // A missing optional icon directory should gracefully retain the existing
    // generic placeholder rather than break food search.
  }
  cachedInventory = { byKey, directoryMtimeMs };
  return cachedInventory;
}

function iconForKeys(keys: readonly string[], match: FoodIcon["match"]) {
  const icons = inventory().byKey;
  for (const key of keys) {
    const icon = icons.get(normalizeFoodIconKey(key));
    if (icon)
      return {
        ...icon,
        url: `/food-icons/${encodeURIComponent(icon.filename)}`,
        match,
      } satisfies FoodIcon;
  }
  return undefined;
}

function tokens(value: string) {
  return normalizeFoodQuery(value)
    .split(/[\s-]+/)
    .filter(Boolean);
}

function foodFamilyToken(token: string) {
  // USDA descriptions frequently pluralize the leading family name ("Peaches,
  // yellow, raw"), while the icon asset is singular. These are intentionally
  // conservative English inflections, not substring matching.
  if (token.endsWith("ies") && token.length > 4)
    return `${token.slice(0, -3)}y`;
  if (token.endsWith("oes") && token.length > 4) return token.slice(0, -2);
  if (
    token.endsWith("es") &&
    token.length > 4 &&
    /(?:ch|sh|ss|x|z)$/.test(token.slice(0, -2))
  )
    return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss"))
    return token.slice(0, -1);
  return token;
}

function familyTokens(value: string) {
  return tokens(value).map(foodFamilyToken);
}

function withoutDescriptors(value: string) {
  return tokens(value)
    .filter((token) => !DESCRIPTORS.has(token))
    .join("-");
}

function hasAll(value: string, required: readonly string[]) {
  const available = new Set(familyTokens(value));
  return required.every((token) => available.has(token));
}

type ControlledMatch = {
  iconKeys: string[];
  required: string[];
  excluded?: string[];
};

// These are food concepts, not individual database records. Each concept is
// only used if a matching asset exists in the dynamically discovered library.
const CONTROLLED_MATCHES: ControlledMatch[] = [
  { iconKeys: ["protein-shake"], required: ["protein", "shake"] },
  { iconKeys: ["protein-bar"], required: ["protein", "bar"] },
  { iconKeys: ["peanut-butter"], required: ["peanut", "butter"] },
  { iconKeys: ["greek-yogurt"], required: ["greek", "yogurt"] },
  { iconKeys: ["olive-oil"], required: ["olive", "oil"] },
  { iconKeys: ["orange-juice"], required: ["orange", "juice"] },
  { iconKeys: ["apple-juice"], required: ["apple", "juice"] },
  { iconKeys: ["sweet-potato", "sweetpotato"], required: ["sweet", "potato"] },
  {
    iconKeys: ["ground-meat", "groundmeat"],
    required: ["ground", "beef"],
    excluded: ["turkey", "chicken", "pork", "lamb"],
  },
  {
    iconKeys: ["ground-meat", "groundmeat"],
    required: ["minced", "beef"],
    excluded: ["turkey", "chicken", "pork", "lamb"],
  },
  { iconKeys: ["chicken"], required: ["chicken", "breast"] },
  { iconKeys: ["chicken"], required: ["chicken", "thigh"] },
  { iconKeys: ["chicken"], required: ["chicken", "fillet"] },
  { iconKeys: ["salmon"], required: ["salmon"] },
  { iconKeys: ["tuna"], required: ["tuna"] },
  { iconKeys: ["turkey"], required: ["turkey"] },
  { iconKeys: ["egg"], required: ["egg"] },
  {
    iconKeys: ["rice"],
    required: ["rice"],
    excluded: ["cake", "pudding", "paper"],
  },
  { iconKeys: ["oats"], required: ["oat"] },
  { iconKeys: ["oats"], required: ["oats"] },
  {
    iconKeys: ["steak"],
    required: ["steak"],
    excluded: ["broth", "stock", "sauce"],
  },
  {
    iconKeys: ["beef"],
    required: ["beef"],
    excluded: ["broth", "stock", "sauce", "ground"],
  },
  { iconKeys: ["chickpeas"], required: ["garbanzo"] },
  { iconKeys: ["chickpeas"], required: ["chickpea"] },
  { iconKeys: ["beans"], required: ["lentil"] },
  { iconKeys: ["beans"], required: ["lentils"] },
  {
    iconKeys: ["brown-rice", "brownrice"],
    required: ["brown", "rice"],
    excluded: ["cake"],
  },
  { iconKeys: ["broccoli", "brocoli"], required: ["broccoli"] },
  { iconKeys: ["cauliflower"], required: ["cauliflower"] },
  { iconKeys: ["zucchini", "zuccini"], required: ["zucchini"] },
  { iconKeys: ["peach", "preach"], required: ["peach"] },
  { iconKeys: ["mayonnaise", "mayonaise"], required: ["mayonnaise"] },
  { iconKeys: ["cappuccino", "cappucchino"], required: ["cappuccino"] },
  { iconKeys: ["burrito", "burrrito"], required: ["burrito"] },
  { iconKeys: ["tortilla", "tortialla"], required: ["tortilla"] },
];

const UNSAFE_FAMILY_COMBINATIONS = [
  ["rice", "cake"],
  ["beef", "broth"],
  ["beef", "stock"],
  ["peanut", "butter"],
] as const;
const SPECIFIC_PRODUCT_TERMS = [
  "pie",
  "juice",
  "nectar",
  "cake",
  "dessert",
  "sauce",
  "drink",
];

// Asset-file spelling corrections and food-family names that cannot be inferred
// from the filename are kept here. All ordinary keys are still discovered from
// the inventory automatically, so adding apricot.png tomorrow needs no code.
const FAMILY_ICON_ALIASES: Record<string, string[]> = {
  peach: ["peach", "preach"],
  broccoli: ["broccoli", "brocoli"],
  zucchini: ["zucchini", "zuccini"],
  potato: ["potato"],
  apple: ["apple"],
  banana: ["banana"],
  strawberry: ["strawberry"],
  salmon: ["salmon"],
  chicken: ["chicken"],
  egg: ["egg"],
  rice: ["rice"],
  beef: ["beef"],
  tuna: ["tuna"],
};

const CATEGORY_FALLBACKS: Array<{
  categoryTokens: string[];
  iconKeys: string[];
}> = [
  { categoryTokens: ["berry", "fruit"], iconKeys: ["fruit"] },
  { categoryTokens: ["fish", "seafood"], iconKeys: ["fish"] },
  { categoryTokens: ["vegetable", "leafy"], iconKeys: ["vegetable"] },
  { categoryTokens: ["nut"], iconKeys: ["nuts"] },
  { categoryTokens: ["cheese"], iconKeys: ["cheese"] },
  { categoryTokens: ["oil"], iconKeys: ["oil"] },
];

function exactIcon(value: string, match: FoodIcon["match"]) {
  const normalized = normalizeFoodIconKey(value);
  return iconForKeys([normalized, withoutDescriptors(value)], match);
}

function keywordIcon(value: string) {
  for (const candidate of CONTROLLED_MATCHES) {
    if (candidate.excluded?.some((token) => tokens(value).includes(token)))
      continue;
    if (hasAll(value, candidate.required)) {
      const icon = iconForKeys(candidate.iconKeys, "KEYWORD");
      if (icon) return icon;
    }
  }
  return undefined;
}

function familyIcon(value: string) {
  const foodTokens = familyTokens(value);
  // Prefer a true prepared-food asset when it exists. This lets a future
  // peach-pie.png or juice.png supersede the underlying fruit automatically.
  for (const term of SPECIFIC_PRODUCT_TERMS) {
    if (foodTokens.includes(term)) {
      const specific = iconForKeys([term], "KEYWORD");
      if (specific) return specific;
    }
  }
  if (
    UNSAFE_FAMILY_COMBINATIONS.some((combination) =>
      combination.every((token) => foodTokens.includes(token))
    )
  )
    return undefined;

  for (const token of foodTokens) {
    // First permit a new sensibly named asset to work without changing this
    // resolver. Then try the small set of legacy filename aliases above.
    const icon = iconForKeys(
      [token, ...(FAMILY_ICON_ALIASES[token] ?? [])],
      "KEYWORD"
    );
    if (icon) return icon;
  }
  return undefined;
}

function categoryIcon(categories: readonly string[]) {
  const categoryText = categories.join(" ");
  for (const fallback of CATEGORY_FALLBACKS) {
    if (
      fallback.categoryTokens.some((token) =>
        tokens(categoryText).includes(token)
      )
    ) {
      const icon = iconForKeys(fallback.iconKeys, "CATEGORY");
      if (icon) return icon;
    }
  }
  return undefined;
}

/**
 * Resolves a generic icon without ever replacing an actual packaged product
 * image. Undefined means callers should keep their existing generic fallback.
 */
export function resolveFoodIcon(
  candidate: FoodIconCandidate
): FoodIcon | undefined {
  const isPackagedImage =
    Boolean(candidate.imageUrl) &&
    (candidate.source === "OPEN_FOOD_FACTS" || candidate.type === "BRANDED");
  if (isPackagedImage) return undefined;

  if (candidate.iconKey) {
    const explicit = iconForKeys([candidate.iconKey], "EXPLICIT");
    if (explicit) return explicit;
  }

  const exact = exactIcon(candidate.name, "EXACT");
  if (exact) return exact;

  for (const alias of candidate.aliases ?? []) {
    const aliasIcon = exactIcon(alias, "ALIAS");
    if (aliasIcon) return aliasIcon;
  }

  for (const value of [candidate.name, ...(candidate.aliases ?? [])]) {
    const controlled = keywordIcon(value);
    if (controlled) return controlled;
    const family = familyIcon(value);
    if (family) return family;
  }

  return categoryIcon(candidate.categories ?? []);
}

/** Exposed for diagnostics/tests; the scan is cached per server process. */
export function availableFoodIcons() {
  return [...new Set(inventory().byKey.values())].map((icon) => ({
    key: icon.key,
    filename: icon.filename,
  }));
}
