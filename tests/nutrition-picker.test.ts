import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deduplicateFoodResults,
  foodResultKey,
} from "../lib/nutrition/result-identity";

test("food-picker identities keep provider collisions distinct but remove exact duplicates", () => {
  const usda = { provider: "USDA", externalId: "2709294" };
  const off = { provider: "OPEN_FOOD_FACTS", externalId: "2709294" };
  assert.notEqual(foodResultKey(usda), foodResultKey(off));
  assert.deepEqual(deduplicateFoodResults([usda, usda, off]), [usda, off]);
  assert.equal(
    foodResultKey({ id: "food_1", externalId: "2709294", source: "USDA" }),
    "local:food_1"
  );
});

test("picker reuses FoodVisual and a compact source-aware food row", async () => {
  const source = await readFile(
    new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /<FoodVisual[\s\S]*imageUrl=\{food\.imageUrl\}[\s\S]*iconPath=\{food\.genericIcon\?\.url\}/
  );
  assert.match(source, /const key = foodResultKey\(food\)/);
  assert.match(source, /deduplicateFoodResults/);
  assert.match(source, /min-w-0 flex-1 items-center gap-3/);
  assert.match(source, /line-clamp-2/);
});

test("picker uses accessible Radix tabs with one value-bound content panel per section", async () => {
  const source = await readFile(
    new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
    "utf8"
  );
  const tabs = await readFile(
    new URL("../components/ui/tabs.tsx", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /<Tabs defaultValue="food" className="flex min-h-0 flex-1 flex-col">/
  );
  assert.match(source, /<TabsTrigger className="flex-1" value="food">\s*Food/);
  assert.match(source, /<TabsContent\s+value="food"/);
  assert.match(source, /<TabsContent\s+value="meals"/);
  assert.match(source, /<TabsContent\s+value="recipes"/);
  assert.match(tabs, /TabsPrimitive\.Root/);
  assert.match(tabs, /data-\[state=active\]:bg-background/);
  assert.match(tabs, /min-w-0 flex-1/);
});

test("food picker opens with a stable viewport and never autofocuses a search input", async () => {
  const [picker, sheet, dialog, drawer, popover, globals] = await Promise.all([
    readFile(
      new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../components/ui/sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/drawer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/popover.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(picker, /<NutritionMobileSheet[\s\S]*scrollable=\{false\}/);
  assert.match(
    picker,
    /min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain/
  );
  assert.doesNotMatch(picker, /h-\[92dvh\]|h-\[min\(48dvh,26rem\)\]/);
  assert.match(
    picker,
    /placeholder="Search foods"[\s\S]*aria-label="Search foods"[\s\S]*value=\{query\}/
  );
  assert.doesNotMatch(picker, /autoFocus/);
  assert.doesNotMatch(picker, /scrollIntoView|window\.scrollTo/);
  assert.match(
    globals,
    /\[data-slot="sheet-content"\] input,[\s\S]*scroll-margin-block: 0/
  );

  for (const source of [sheet, dialog, drawer, popover]) {
    assert.match(source, /onOpenAutoFocus=\{\(event\) =>/);
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /content\.focus\(\{ preventScroll: true \}\)/);
  }
});

test("Food Picker reserves the final quick-action row while capabilities are unknown", async () => {
  const [picker, quickActions] = await Promise.all([
    readFile(
      new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL(
        "../components/nutrition/NutritionQuickActions.tsx",
        import.meta.url
      ),
      "utf8"
    ),
  ]);

  assert.match(picker, /quickActionCapabilitiesCache/);
  assert.match(picker, /<NutritionQuickActionsPlaceholder \/>/);
  assert.doesNotMatch(picker, /h-9 animate-pulse rounded-md bg-muted/);
  assert.match(
    quickActions,
    /export function NutritionQuickActionsPlaceholder\(\)[\s\S]*data-slot="nutrition-quick-actions"[\s\S]*grid grid-cols-3 gap-2/
  );
  assert.match(
    quickActions,
    /function NutritionQuickActions\([\s\S]*data-slot="nutrition-quick-actions"[\s\S]*grid grid-cols-3 gap-2/
  );
  assert.match(
    quickActions,
    /\["Barcode", "AI Scan", "Describe"\]\.map\(\(label\)/
  );
});

test("empty search starts with a stable Saved Foods surface and reuses the session cache", async () => {
  const source = await readFile(
    new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /let savedFoodsCache: Food\[\] \| null = null/);
  assert.match(source, /const savedLoading =[\s\S]*savedFoodsCache === null/);
  assert.match(source, /void loadSavedFoods\(\)/);
  assert.match(source, /query\.trim\(\)\.length < 2 && savedLoading/);
  assert.match(source, /<Skeleton className="h-16 w-full" \/>/);
  assert.match(source, /value\.trim\(\)\.length < 2 && savedFoodsCache/);
  assert.match(source, /savedFoodsCache = food\.isSaved/);
  assert.doesNotMatch(
    source,
    /setTimeout[\s\S]{0,140}"\/api\/nutrition\/saved-foods"/
  );
});

test("food search reserves the result region and exposes current-query loading and errors", async () => {
  const source = await readFile(
    new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /const \[searchLoading, setSearchLoading\] = useState\(false\)/
  );
  assert.match(
    source,
    /const \[searchFailed, setSearchFailed\] = useState\(false\)/
  );
  assert.match(source, /setSearchLoading\(value\.trim\(\)\.length >= 2\)/);
  assert.match(source, /query\.trim\(\)\.length >= 2 && searchLoading/);
  assert.match(source, /Searching foods…/);
  assert.match(source, /aria-busy="true"/);
  assert.match(source, /query\.trim\(\)\.length >= 2 && searchFailed/);
  assert.match(source, /Couldn&apos;t search foods\. Please try again\./);
  assert.match(source, /data-slot="food-picker-results"/);
  assert.match(
    source,
    /data-slot="food-picker-results"[\s\S]*min-h-0 flex-1[\s\S]*overflow-y-auto/
  );
});

test("nutrition overlay inputs require an explicit user interaction before focus", async () => {
  const [quickActions, savedMeals, workoutBuilder, dateOfBirth] =
    await Promise.all([
      readFile(
        new URL(
          "../components/nutrition/NutritionQuickActions.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../components/nutrition/NutritionSavedMeals.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../components/profile/DateOfBirthPicker.tsx", import.meta.url),
        "utf8"
      ),
    ]);

  assert.match(quickActions, /id="manual-barcode"/);
  assert.match(quickActions, /id="nutrition-description"/);
  assert.match(quickActions, /id="draft-food-search"/);
  assert.doesNotMatch(quickActions, /autoFocus|\.focus\(/);
  assert.doesNotMatch(savedMeals, /autoFocus|\.focus\(/);
  assert.doesNotMatch(workoutBuilder, /autoFocus/);
  assert.doesNotMatch(dateOfBirth, /autoFocus/);
});

test("nutrition keeps the picker and its scanner/search stack out of the base route", async () => {
  const [source, picker] = await Promise.all([
    readFile(
      new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../components/nutrition/FoodPicker.tsx", import.meta.url),
      "utf8"
    ),
  ]);
  assert.match(source, /foodVisual\?\.imageUrl/);
  assert.match(source, /DropdownMenuTrigger asChild/);
  assert.match(source, /Actions for \$\{entry\.foodNameSnapshot\}/);
  assert.match(source, /onSelect=\{\(\) => onEdit\(entry\)\}/);
  assert.match(
    source,
    /variant="destructive"[\s\S]*onSelect=\{\(\) => onDelete\(entry\.id\)\}/
  );
  assert.match(
    source,
    /dynamic\([\s\S]*import\("@\/components\/nutrition\/FoodPicker"/
  );
  assert.match(source, /\{meal \? \(/);
  assert.doesNotMatch(
    source,
    /from "@\/components\/nutrition\/NutritionQuickActions"/
  );
  assert.match(
    picker,
    /from "@\/components\/nutrition\/NutritionQuickActions"/
  );
  assert.match(picker, /AbortController/);
});

test("daily GET, create, and edit all use the canonical entry serializer", async () => {
  const [daily, mutation, serializer] = await Promise.all([
    readFile(
      new URL("../app/api/user/nutrition/route.ts", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../app/api/user/nutrition/[id]/route.ts", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../lib/nutrition/entry-serializer.ts", import.meta.url),
      "utf8"
    ),
  ]);
  assert.match(daily, /entries\.map\(serializeNutritionEntry\)/);
  assert.match(
    daily,
    /NextResponse\.json\(serializeNutritionEntry\(entry\), \{ status: 201 \}\)/
  );
  assert.match(
    mutation,
    /NextResponse\.json\(serializeNutritionEntry\(updated\)\)/
  );
  assert.match(serializer, /foodVisual: toFoodSummary\(food\)/);
});
