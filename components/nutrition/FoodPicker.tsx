"use client";

import { Bookmark, BookmarkX, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FoodDetailsDialog,
  type FoodDetailsPreview,
  type FoodUseSelection,
} from "@/components/nutrition/FoodDetailsDialog";
import { FoodVisual } from "@/components/nutrition/FoodVisual";
import {
  NutritionQuickActions,
  NutritionQuickActionsPlaceholder,
  type NutritionQuickActionCapabilities,
} from "@/components/nutrition/NutritionQuickActions";
import { NutritionMobileSheet } from "@/components/nutrition/NutritionMobileSheet";
import { NutritionSavedMeals } from "@/components/nutrition/NutritionSavedMeals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  defaultFoodUseAmount,
  resolveFoodForUse,
} from "@/lib/nutrition/food-use-client";
import {
  deduplicateFoodResults,
  foodResultKey,
} from "@/lib/nutrition/result-identity";
import { NUTRITION_SEARCH_RESULT_LIMIT } from "@/lib/nutrition/search-ranking";
import { getNativePlatform, isNativeApp } from "@/lib/native/platform";
import {
  getSavedFoodsCache,
  loadSavedFoodsCache,
  updateSavedFoodsCache,
} from "@/lib/nutrition/saved-foods-cache";

export type NutritionPickerMeal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACKS";

export type NutritionPickerEntry = {
  id: string;
  foodId: string;
  mealCategory: NutritionPickerMeal;
  foodNameSnapshot: string;
  brandNameSnapshot?: string | null;
  gramsConsumed: string | number;
  quantity: string | number;
  unit: string;
  caloriesKcalSnapshot?: string | number | null;
  proteinGramsSnapshot?: string | number | null;
  carbohydrateGramsSnapshot?: string | number | null;
  fatGramsSnapshot?: string | number | null;
  fiberGramsSnapshot?: string | number | null;
  sugarGramsSnapshot?: string | number | null;
  saturatedFatGramsSnapshot?: string | number | null;
  sodiumMgSnapshot?: string | number | null;
  foodVisual?: {
    imageUrl?: string | null;
    genericIcon?: { key?: string; url: string } | null;
  };
};

type Food = {
  id?: string;
  provider?: "USDA" | "OPEN_FOOD_FACTS";
  source?: string;
  externalId: string;
  name: string;
  brandName?: string | null;
  imageUrl?: string | null;
  genericIcon?: { key?: string; url: string } | null;
  servings?: Array<{ name: string; grams: number; isDefault?: boolean }>;
  nutritionPer100g: Record<string, number | undefined>;
  isLocal?: boolean;
  isSaved?: boolean;
};

let quickActionCapabilitiesCache: NutritionQuickActionCapabilities | null =
  null;
const isDevelopment = process.env.NODE_ENV === "development";

function logSearchFocus(event: string, input: HTMLInputElement) {
  if (!isDevelopment || !isNativeApp()) return;
  const sheet = input.closest('[data-slot="sheet-content"]');
  const results = sheet?.querySelector<HTMLElement>(
    '[data-slot="food-picker-results"]'
  );
  const sheetBody = sheet?.querySelector<HTMLElement>(
    '[data-slot="nutrition-sheet-scroll"]'
  );
  console.debug("[food-search-focus]", {
    event,
    activeElement: document.activeElement?.tagName ?? null,
    windowScrollY: window.scrollY,
    documentScrollTop: document.documentElement.scrollTop,
    sheetScrollTop: sheetBody?.scrollTop ?? null,
    resultsScrollTop: results?.scrollTop ?? null,
    innerHeight: window.innerHeight,
    visualViewportHeight: window.visualViewport?.height ?? null,
  });
}

function format(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function FoodPicker({
  meal,
  date,
  close,
  onAddEntries,
  onSavedFoodChange,
}: {
  meal: NutritionPickerMeal | null;
  date: string;
  close: () => void;
  onAddEntries: (entries: NutritionPickerEntry[]) => void;
  onSavedFoodChange?: (foodId: string, saved: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>(
    () => getSavedFoodsCache<Food>() ?? []
  );
  const [inspectedFood, setInspectedFood] = useState<Food | null>(null);
  const [quickAdding, setQuickAdding] = useState<string | null>(null);
  const [savedFoodsFailed, setSavedFoodsFailed] = useState(false);
  const [savingFoodIds, setSavingFoodIds] = useState<Set<string>>(
    () => new Set()
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [quickActionCapabilities, setQuickActionCapabilities] =
    useState<NutritionQuickActionCapabilities | null>(
      () => quickActionCapabilitiesCache
    );
  const savedLoading =
    query.trim().length < 2 &&
    getSavedFoodsCache<Food>() === null &&
    !savedFoodsFailed;

  useEffect(() => {
    if (quickActionCapabilitiesCache) return;
    const controller = new AbortController();
    void fetch("/api/nutrition/capabilities", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((capabilities) => {
        if (capabilities && !controller.signal.aborted) {
          quickActionCapabilitiesCache = capabilities;
          setQuickActionCapabilities(capabilities);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!meal) return;
    const controller = new AbortController();
    const isSearching = query.trim().length >= 2;
    if (!isSearching) {
      if (getSavedFoodsCache<Food>()) {
        return () => controller.abort();
      } else {
        void loadSavedFoodsCache<Food>()
          .then((saved: Food[]) => {
            if (!controller.signal.aborted) setFoods(saved);
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setFoods([]);
              setSavedFoodsFailed(true);
            }
          });
      }
      return () => controller.abort();
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/nutrition/foods/search?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) throw new Error("Unable to search foods.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        const savedFoodIds = new Set(
          getSavedFoodsCache<Food>()
            ?.map((food) => food.id)
            .filter((id): id is string => Boolean(id)) ?? []
        );
        setFoods(
          deduplicateFoodResults(
            data.results ?? [
              ...(data.genericResults ?? []),
              ...(data.localResults ?? []),
              ...(data.packagedResults ?? []),
            ]
          )
            .slice(0, NUTRITION_SEARCH_RESULT_LIMIT)
            .map((food) =>
              food.id ? { ...food, isSaved: savedFoodIds.has(food.id) } : food
            ) as Food[]
        );
        setSearchLoading(false);
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") {
          setFoods([]);
          setSearchFailed(true);
          setSearchLoading(false);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [meal, query]);

  function dismiss() {
    setQuery("");
    setFoods([]);
    setInspectedFood(null);
    setSearchLoading(false);
    setSearchFailed(false);
    close();
  }

  function handleSearchPointerDown(
    event: React.PointerEvent<HTMLInputElement>
  ) {
    const input = event.currentTarget;
    logSearchFocus("pointerdown", input);
    if (
      !isNativeApp() ||
      getNativePlatform() !== "ios" ||
      document.activeElement === input
    ) {
      return;
    }

    // Search is already in the fixed picker header. Claim the user gesture
    // and focus it without allowing WKWebView to scroll an ancestor first.
    event.preventDefault();
    input.focus({ preventScroll: true });
  }

  async function toggleSaved(food: Food) {
    if (!food.id || savingFoodIds.has(food.id)) return;
    const saved = Boolean(food.isSaved);
    setSavingFoodIds((current) => new Set(current).add(food.id!));
    try {
      const response = await fetch(
        saved
          ? `/api/nutrition/saved-foods/${food.id}`
          : "/api/nutrition/saved-foods",
        saved
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ foodId: food.id }),
            }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return toast.error(
          payload?.error?.message ??
            payload?.error ??
            "Unable to update saved foods."
        );
      }
      const savedFood = (payload?.food ?? food) as Food;
      setFoods((current) =>
        saved
          ? query.trim().length < 2
            ? current.filter((item) => item.id !== food.id)
            : current.map((item) =>
                item.id === food.id ? { ...item, isSaved: false } : item
              )
          : query.trim().length < 2
          ? [
              { ...savedFood, isSaved: true },
              ...current.filter((item) => item.id !== food.id),
            ]
          : current.map((item) =>
              item.id === food.id ? { ...savedFood, isSaved: true } : item
            )
      );
      updateSavedFoodsCache(savedFood, !saved);
      onSavedFoodChange?.(food.id, !saved);
      toast.success(
        saved ? `Removed ${food.name} from saved foods.` : `${food.name} saved.`
      );
    } finally {
      setSavingFoodIds((current) => {
        const next = new Set(current);
        next.delete(food.id!);
        return next;
      });
    }
  }

  async function logFood({ foodId, grams, unit }: FoodUseSelection) {
    if (!meal) throw new Error("Choose a meal before using this food.");
    const response = await fetch("/api/user/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        foodId,
        date,
        mealCategory: meal,
        gramsConsumed: grams,
        quantity: 1,
        unit,
      }),
    });
    if (!response.ok) throw new Error("Unable to add food.");
    onAddEntries([await response.json()]);
    dismiss();
  }

  async function quickAdd(food: Food) {
    const key = foodResultKey(food);
    if (quickAdding) return;
    setQuickAdding(key);
    try {
      const { foodId } = await resolveFoodForUse(food);
      await logFood({ foodId, ...defaultFoodUseAmount(food) });
      toast.success(`${food.name} added to ${meal?.toLowerCase()}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add food."
      );
    } finally {
      setQuickAdding(null);
    }
  }

  return (
    <>
      <Sheet
        open={Boolean(meal) && !inspectedFood}
        onOpenChange={(value) => {
          if (!value && !inspectedFood) dismiss();
        }}
      >
        <NutritionMobileSheet
          header={
            <SheetHeader>
              <SheetTitle>Add to {meal?.toLowerCase()}</SheetTitle>
              <SheetDescription>
                Tap a food for details or use + to add its default serving.
              </SheetDescription>
            </SheetHeader>
          }
          scrollable={false}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <Input
              placeholder="Search foods"
              aria-label="Search foods"
              value={query}
              onPointerDown={handleSearchPointerDown}
              onFocus={(event) => logSearchFocus("focus", event.currentTarget)}
              onBlur={(event) => logSearchFocus("blur", event.currentTarget)}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                setSearchLoading(value.trim().length >= 2);
                setSearchFailed(false);
                if (value.trim().length < 2) {
                  setFoods(getSavedFoodsCache<Food>() ?? []);
                }
              }}
            />
            {quickActionCapabilities ? (
              <NutritionQuickActions
                meal={meal!}
                date={date}
                onEntries={(created) =>
                  onAddEntries(created as NutritionPickerEntry[])
                }
                capabilities={quickActionCapabilities}
              />
            ) : (
              <NutritionQuickActionsPlaceholder />
            )}
            <Tabs defaultValue="food" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="shrink-0 w-full">
                <TabsTrigger className="flex-1" value="food">
                  Food
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="meals">
                  Meals
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="recipes">
                  Recipes
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="food"
                className="mt-2 flex min-h-0 flex-1 flex-col"
              >
                <div
                  data-keyboard-dismiss-on-scroll
                  data-slot="food-picker-results"
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-lg border p-1.5 [-webkit-overflow-scrolling:touch]"
                  aria-label="Food search results"
                >
                  {query.trim().length < 2 && savedLoading ? (
                    <div className="space-y-2 p-2" aria-busy="true">
                      <p className="text-sm font-medium">Saved foods</p>
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : query.trim().length < 2 ? (
                    <p className="px-2 pt-1 text-sm font-medium">Saved foods</p>
                  ) : null}
                  {query.trim().length >= 2 && searchLoading ? (
                    <div
                      className="flex min-h-full items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground"
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <Loader2 className="size-4 animate-spin" />
                      Searching foods…
                    </div>
                  ) : !savedLoading && foods.length ? (
                    foods.map((food) => {
                      const key = foodResultKey(food);
                      const adding = quickAdding === key;
                      const saving = food.id
                        ? savingFoodIds.has(food.id)
                        : false;
                      return (
                        <div
                          key={key}
                          className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border p-2"
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setInspectedFood(food)}
                          >
                            <FoodVisual
                              imageUrl={food.imageUrl}
                              iconPath={food.genericIcon?.url}
                              name={food.name}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 block font-medium">
                                {food.name}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {food.brandName ? `${food.brandName} · ` : ""}
                                {format(
                                  Number(
                                    food.nutritionPer100g.caloriesKcal ?? 0
                                  )
                                )}{" "}
                                kcal · P{" "}
                                {format(
                                  Number(
                                    food.nutritionPer100g.proteinGrams ?? 0
                                  )
                                )}{" "}
                                · C{" "}
                                {format(
                                  Number(
                                    food.nutritionPer100g.carbohydrateGrams ?? 0
                                  )
                                )}{" "}
                                · F{" "}
                                {format(
                                  Number(food.nutritionPer100g.fatGrams ?? 0)
                                )}{" "}
                                per 100 g
                              </span>
                            </span>
                            {food.isSaved ? (
                              <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Bookmark className="size-3" /> Saved
                              </span>
                            ) : null}
                          </button>
                          <Button
                            size="icon-sm"
                            aria-label={`Quick add ${food.name}`}
                            title="Add default serving"
                            disabled={Boolean(quickAdding)}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void quickAdd(food);
                            }}
                          >
                            {adding ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Plus />
                            )}
                          </Button>
                          {food.id ? (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={saving}
                              aria-label={
                                food.isSaved
                                  ? `Remove ${food.name} from saved foods`
                                  : `Save ${food.name}`
                              }
                              onClick={() => void toggleSaved(food)}
                            >
                              {saving ? (
                                <Loader2 className="animate-spin" />
                              ) : food.isSaved ? (
                                <BookmarkX />
                              ) : (
                                <Bookmark />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                  ) : query.trim().length >= 2 && searchFailed ? (
                    <p
                      className="p-4 text-center text-sm text-muted-foreground"
                      role="alert"
                    >
                      Couldn&apos;t search foods. Please try again.
                    </p>
                  ) : query.trim().length >= 2 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      No foods found. Try a more specific search.
                    </p>
                  ) : !savedLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        No saved foods yet.
                      </p>
                      <p className="mt-1">
                        Save foods you use often to find them here quickly.
                      </p>
                    </div>
                  ) : null}
                </div>
              </TabsContent>
              <TabsContent
                value="meals"
                className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <NutritionSavedMeals
                  mealCategory={meal!}
                  date={date}
                  onEntries={(created) =>
                    onAddEntries(created as NutritionPickerEntry[])
                  }
                />
              </TabsContent>
              <TabsContent
                value="recipes"
                className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <Empty
                  title="No recipes yet"
                  text="Create a recipe and define its ingredients and servings."
                  action="Create recipe"
                />
              </TabsContent>
            </Tabs>
          </div>
        </NutritionMobileSheet>
      </Sheet>
      <FoodDetailsDialog
        food={inspectedFood as FoodDetailsPreview | null}
        open={Boolean(inspectedFood)}
        onOpenChange={(open) => {
          if (!open) setInspectedFood(null);
        }}
        onUseFood={logFood}
      />
    </>
  );
}

function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: string;
}) {
  return (
    <div className="py-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      <Button
        className="mt-3"
        variant="outline"
        onClick={() => toast.message(`${action} is coming soon.`)}
      >
        <Plus />
        {action}
      </Button>
    </div>
  );
}
