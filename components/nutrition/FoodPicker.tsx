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
import { NutritionQuickActions } from "@/components/nutrition/NutritionQuickActions";
import { NutritionSavedMeals } from "@/components/nutrition/NutritionSavedMeals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
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
  isSaved?: boolean;
};

function format(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function FoodPicker({
  meal,
  date,
  close,
  onAddEntries,
}: {
  meal: NutritionPickerMeal | null;
  date: string;
  close: () => void;
  onAddEntries: (entries: NutritionPickerEntry[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [inspectedFood, setInspectedFood] = useState<Food | null>(null);
  const [quickAdding, setQuickAdding] = useState<string | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [quickActionCapabilities, setQuickActionCapabilities] = useState<{
    canUseAiScan: boolean;
    canUseBarcodeScan: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/nutrition/capabilities", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((capabilities) => {
        if (capabilities && !controller.signal.aborted)
          setQuickActionCapabilities(capabilities);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!meal) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const isSearching = query.trim().length >= 2;
      const path = isSearching
        ? `/api/nutrition/foods/search?q=${encodeURIComponent(query.trim())}`
        : "/api/nutrition/saved-foods";
      setSavedLoading(!isSearching);
      try {
        const response = await fetch(path, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        setFoods(
          deduplicateFoodResults(
            isSearching
              ? data.results ?? [
                  ...(data.genericResults ?? []),
                  ...(data.localResults ?? []),
                  ...(data.packagedResults ?? []),
                ]
              : data.foods ?? []
          ).slice(0, NUTRITION_SEARCH_RESULT_LIMIT) as Food[]
        );
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") setFoods([]);
      } finally {
        if (!controller.signal.aborted) setSavedLoading(false);
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
    close();
  }

  async function toggleSaved(food: Food) {
    if (!food.id) return;
    const response = await fetch(
      food.isSaved
        ? `/api/nutrition/saved-foods/${food.id}`
        : "/api/nutrition/saved-foods",
      food.isSaved
        ? { method: "DELETE" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ foodId: food.id }),
          }
    );
    if (!response.ok) return toast.error("Unable to update saved foods.");
    setFoods((current) =>
      food.isSaved
        ? current.filter((item) => item.id !== food.id)
        : current.map((item) =>
            item.id === food.id ? { ...item, isSaved: true } : item
          )
    );
    toast.success(
      food.isSaved
        ? `Removed ${food.name} from saved foods.`
        : `${food.name} saved.`
    );
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
        <SheetContent
          side="bottom"
          className="h-[92dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle>Add to {meal?.toLowerCase()}</SheetTitle>
            <SheetDescription>
              Tap a food for details or use + to add its default serving.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <Input
              placeholder="Search foods"
              aria-label="Search foods"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
              <div
                className="h-9 animate-pulse rounded-md bg-muted"
                aria-busy="true"
              />
            )}
            <Tabs defaultValue="food">
              <TabsList className="w-full">
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
              <TabsContent value="food" className="mt-2">
                <ScrollArea
                  className="h-[min(48dvh,26rem)] rounded-lg border"
                  aria-label="Food search results"
                >
                  <div
                    data-keyboard-dismiss-on-scroll
                    className="space-y-2 p-1.5"
                  >
                    {query.trim().length < 2 ? (
                      <p className="px-2 pt-1 text-sm font-medium">
                        Saved foods
                      </p>
                    ) : null}
                    {foods.length ? (
                      foods.map((food) => {
                        const key = foodResultKey(food);
                        const adding = quickAdding === key;
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
                                      food.nutritionPer100g.carbohydrateGrams ??
                                        0
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
                                aria-label={
                                  food.isSaved
                                    ? `Remove ${food.name} from saved foods`
                                    : `Save ${food.name}`
                                }
                                onClick={() => void toggleSaved(food)}
                              >
                                {food.isSaved ? <BookmarkX /> : <Bookmark />}
                              </Button>
                            ) : null}
                          </div>
                        );
                      })
                    ) : query.trim().length >= 2 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        No foods found. Try a more specific search.
                      </p>
                    ) : savedLoading ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        Loading saved foods…
                      </p>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">
                          No saved foods yet.
                        </p>
                        <p className="mt-1">
                          Save foods you use often to find them here quickly.
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="meals">
                <NutritionSavedMeals
                  mealCategory={meal!}
                  date={date}
                  onEntries={(created) =>
                    onAddEntries(created as NutritionPickerEntry[])
                  }
                />
              </TabsContent>
              <TabsContent value="recipes">
                <Empty
                  title="No recipes yet"
                  text="Create a recipe and define its ingredients and servings."
                  action="Create recipe"
                />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
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
