"use client";

import { Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FoodVisual } from "@/components/nutrition/FoodVisual";
import { NutritionAmountInput } from "@/components/nutrition/NutritionAmountInput";
import { NutritionMobileSheet } from "@/components/nutrition/NutritionMobileSheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type MealCategory = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACKS";
type Food = {
  id?: string;
  provider?: "USDA" | "OPEN_FOOD_FACTS";
  externalId: string;
  name: string;
  brandName?: string | null;
  imageUrl?: string | null;
  genericIcon?: { url: string } | null;
  nutritionPer100g: Record<string, number | undefined>;
  servings?: Array<{ name: string; grams: number }>;
};
type MealItem = {
  id?: string;
  foodId: string;
  grams: number;
  quantity: number;
  unit: string;
  food: Food & { id: string };
};
type SavedMeal = {
  id: string;
  name: string;
  items: MealItem[];
};

const format = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
const mealLabel = (meal: MealCategory) =>
  meal.charAt(0) + meal.slice(1).toLowerCase();
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function totals(items: MealItem[]) {
  return items.reduce(
    (sum, item) => {
      const multiplier = (item.grams * item.quantity) / 100;
      return {
        calories:
          sum.calories +
          number(item.food.nutritionPer100g.caloriesKcal) * multiplier,
        protein:
          sum.protein +
          number(item.food.nutritionPer100g.proteinGrams) * multiplier,
        carbs:
          sum.carbs +
          number(item.food.nutritionPer100g.carbohydrateGrams) * multiplier,
        fat: sum.fat + number(item.food.nutritionPer100g.fatGrams) * multiplier,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? body?.error ?? fallback;
}

async function importFood(food: Food): Promise<Food & { id: string }> {
  if (food.id) return food as Food & { id: string };
  if (!food.provider) throw new Error("This food cannot be added yet.");
  const response = await fetch("/api/nutrition/foods/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: food.provider,
      externalId: food.externalId,
    }),
  });
  if (!response.ok)
    throw new Error(await responseMessage(response, "Unable to add food."));
  const imported = (await response.json()).food as Food & { id: string };
  return { ...food, ...imported, servings: imported.servings ?? food.servings };
}

async function searchFoods(query: string) {
  const response = await fetch(
    `/api/nutrition/foods/search?q=${encodeURIComponent(query)}`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error("Unable to search foods.");
  const data = await response.json();
  return (data.results ?? [
    ...(data.genericResults ?? []),
    ...(data.localResults ?? []),
    ...(data.packagedResults ?? []),
  ]) as Food[];
}

export function NutritionSavedMeals({
  mealCategory,
  date,
  onEntries,
}: {
  mealCategory: MealCategory;
  date: string;
  onEntries: (entries: Record<string, unknown>[]) => void;
}) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadMeals() {
    setLoading(true);
    try {
      const response = await fetch("/api/nutrition/meals", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to load meals.");
      setMeals((await response.json()).meals as SavedMeal[]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load meals."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMeals();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function logMeal(savedMeal: SavedMeal) {
    try {
      const response = await fetch(`/api/nutrition/meals/${savedMeal.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealCategory }),
      });
      if (!response.ok)
        throw new Error(await responseMessage(response, "Unable to log meal."));
      onEntries((await response.json()).entries);
      toast.success(`${savedMeal.name} added to ${mealLabel(mealCategory)}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to log meal."
      );
    }
  }

  if (loading)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading meals…
      </p>
    );

  return (
    <div className="space-y-3">
      {meals.length ? (
        meals.map((savedMeal) => {
          const total = totals(savedMeal.items);
          return (
            <Card key={savedMeal.id}>
              <CardContent className="flex min-w-0 items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{savedMeal.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {savedMeal.items.length}{" "}
                    {savedMeal.items.length === 1 ? "item" : "items"} ·{" "}
                    {format(total.calories)} kcal · P {format(total.protein)} ·
                    C {format(total.carbs)} · F {format(total.fat)}
                  </p>
                </div>
                <Button size="sm" onClick={() => void logMeal(savedMeal)}>
                  Add
                </Button>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <div className="py-8 text-center">
          <p className="font-semibold">No meals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create reusable meals from foods you eat together.
          </p>
        </div>
      )}
      <Button
        className="w-full"
        variant="outline"
        onClick={() => setCreating(true)}
      >
        <Plus />
        Create meal
      </Button>
      <CreateMealSheet
        open={creating}
        close={() => setCreating(false)}
        onCreated={(savedMeal) => {
          setMeals((current) => [savedMeal, ...current]);
          setCreating(false);
        }}
      />
    </div>
  );
}

function CreateMealSheet({
  open,
  close,
  onCreated,
}: {
  open: boolean;
  close: () => void;
  onCreated: (meal: SavedMeal) => void;
}) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<MealItem[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = useMemo(() => totals(items), [items]);
  function dismiss() {
    setName("");
    setItems([]);
    setSelecting(false);
    setBusy(false);
    setError("");
    close();
  }
  async function save() {
    if (!name.trim()) return setError("Enter a meal name.");
    if (!items.length) return setError("Add at least one food.");
    if (items.some((item) => !(item.grams > 0) || !(item.quantity > 0))) {
      return setError("Enter a valid amount and quantity for every food.");
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/nutrition/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          items: items.map((item) => ({
            foodId: item.foodId,
            grams: item.grams,
            quantity: item.quantity,
            unit: item.unit,
          })),
        }),
      });
      if (!response.ok)
        throw new Error(
          await responseMessage(response, "Unable to create meal.")
        );
      onCreated(await response.json());
      dismiss();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create meal."
      );
      setBusy(false);
    }
  }
  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && dismiss()}>
        <NutritionMobileSheet
          header={
            <SheetHeader>
              <SheetTitle>Create meal</SheetTitle>
              <SheetDescription>
                Save a reusable combination of foods and portions.
              </SheetDescription>
            </SheetHeader>
          }
          footer={
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}Create meal
            </Button>
          }
        >
          <div className="space-y-4">
            <Label htmlFor="meal-name">
              Meal name
              <Input
                id="meal-name"
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Shrimp Salad"
              />
            </Label>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                setPickerKey((value) => value + 1);
                setSelecting(true);
              }}
            >
              <Plus />
              Add items
            </Button>
            {items.length ? (
              <>
                <MealItemList items={items} setItems={setItems} />
                <Card>
                  <CardContent className="p-3">
                    <p className="font-medium">Meal total</p>
                    <p className="text-sm text-muted-foreground">
                      {format(total.calories)} kcal · P {format(total.protein)}{" "}
                      · C {format(total.carbs)} · F {format(total.fat)}
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                Add foods to build this meal.
              </p>
            )}
            {error ? (
              <Alert>
                <AlertTitle>Meal not created</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </NutritionMobileSheet>
      </Sheet>
      <MealItemSelector
        key={pickerKey}
        open={selecting}
        items={items}
        close={() => setSelecting(false)}
        onUpdate={setItems}
      />
    </>
  );
}

function MealItemSelector({
  open,
  items,
  close,
  onUpdate,
}: {
  open: boolean;
  items: MealItem[];
  close: () => void;
  onUpdate: (items: MealItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Map<string, MealItem>>(
    () => new Map(items.map((item) => [item.foodId, item]))
  );
  async function search() {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      setResults(await searchFoods(query.trim()));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to search foods."
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(food: Food) {
    const identity = food.id ?? `${food.provider}:${food.externalId}`;
    if (selected.has(identity)) {
      setSelected((current) => {
        const next = new Map(current);
        next.delete(identity);
        return next;
      });
      return;
    }
    setBusy(true);
    try {
      const imported = await importFood(food);
      setSelected((current) =>
        new Map(current).set(identity, {
          foodId: imported.id,
          grams: imported.servings?.[0]?.grams ?? 100,
          quantity: 1,
          unit: imported.servings?.[0]?.name.slice(0, 40) ?? "g",
          food: imported,
        })
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to select food."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <NutritionMobileSheet
        header={
          <SheetHeader>
            <SheetTitle>Add meal items</SheetTitle>
            <SheetDescription>
              Select multiple foods, then set their portions.
            </SheetDescription>
          </SheetHeader>
        }
        footer={
          <Button
            className="w-full"
            disabled={!selected.size}
            onClick={() => {
              onUpdate([...selected.values()]);
              close();
            }}
          >
            Update meal items ({selected.size})
          </Button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search foods"
              aria-label="Search foods for meal"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
            />
            <Button
              variant="outline"
              disabled={busy || query.trim().length < 2}
              onClick={() => void search()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Search />}
            </Button>
          </div>
          <div
            data-keyboard-dismiss-on-scroll
            className="max-h-[min(58dvh,34rem)] space-y-1 overflow-y-auto overscroll-contain pr-1"
          >
            {results.map((food) => {
              const selectedFood = selected.get(
                food.id ?? `${food.provider}:${food.externalId}`
              );
              return (
                <button
                  key={`${food.id ? "local" : food.provider}:${
                    food.id ?? food.externalId
                  }`}
                  type="button"
                  aria-pressed={Boolean(selectedFood)}
                  aria-label={`${food.name}, ${
                    selectedFood ? "selected" : "not selected"
                  }`}
                  className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border p-2 text-left hover:bg-muted/50"
                  onClick={() => void toggle(food)}
                >
                  <FoodVisual
                    imageUrl={food.imageUrl}
                    iconPath={food.genericIcon?.url}
                    name={food.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm font-medium">
                      {food.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(number(food.nutritionPer100g.caloriesKcal))} kcal
                      · P {format(number(food.nutritionPer100g.proteinGrams))} ·
                      C{" "}
                      {format(number(food.nutritionPer100g.carbohydrateGrams))}{" "}
                      · F {format(number(food.nutritionPer100g.fatGrams))}
                    </span>
                  </span>
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border"
                    aria-hidden="true"
                  >
                    {selectedFood ? <Check className="size-4" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </NutritionMobileSheet>
    </Sheet>
  );
}

function MealItemList({
  items,
  setItems,
}: {
  items: MealItem[];
  setItems: (items: MealItem[] | ((items: MealItem[]) => MealItem[])) => void;
}) {
  const [amountInputVersions, setAmountInputVersions] = useState<
    Record<string, number>
  >({});
  const resetAmountInputs = (foodId: string) =>
    setAmountInputVersions((current) => ({
      ...current,
      [foodId]: (current[foodId] ?? 0) + 1,
    }));
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const itemTotal = totals([item]);
        return (
          <Card key={item.foodId}>
            <CardContent className="p-3">
              <div className="flex min-w-0 gap-3">
                <FoodVisual
                  imageUrl={item.food.imageUrl}
                  iconPath={item.food.genericIcon?.url}
                  name={item.food.name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium">{item.food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(itemTotal.calories)} kcal · P{" "}
                    {format(itemTotal.protein)} · C {format(itemTotal.carbs)} ·
                    F {format(itemTotal.fat)}
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${item.food.name}`}
                  onClick={() =>
                    setItems((current) =>
                      current.filter(
                        (candidate) => candidate.foodId !== item.foodId
                      )
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Label>
                  Grams
                  <NutritionAmountInput
                    key={`${item.foodId}:${
                      amountInputVersions[item.foodId] ?? 0
                    }:grams`}
                    ariaLabel={`Amount in grams for ${item.food.name}`}
                    initialValue={item.grams}
                    onValidChange={(grams) =>
                      setItems((current) =>
                        current.map((candidate) =>
                          candidate.foodId === item.foodId
                            ? {
                                ...candidate,
                                grams,
                                unit: "g",
                              }
                            : candidate
                        )
                      )
                    }
                  />
                </Label>
                <Label>
                  Quantity
                  <NutritionAmountInput
                    key={`${item.foodId}:${
                      amountInputVersions[item.foodId] ?? 0
                    }:quantity`}
                    ariaLabel={`Number of servings for ${item.food.name}`}
                    initialValue={item.quantity}
                    onValidChange={(quantity) =>
                      setItems((current) =>
                        current.map((candidate) =>
                          candidate.foodId === item.foodId
                            ? {
                                ...candidate,
                                quantity,
                              }
                            : candidate
                        )
                      )
                    }
                  />
                </Label>
              </div>
              {item.food.servings?.length ? (
                <Label className="mt-2 block">
                  Serving
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={item.unit}
                    onChange={(event) => {
                      const serving = item.food.servings?.find(
                        (candidate) =>
                          candidate.name.slice(0, 40) === event.target.value
                      );
                      if (!serving) {
                        if (event.target.value === "g") {
                          setItems((current) =>
                            current.map((candidate) =>
                              candidate.foodId === item.foodId
                                ? { ...candidate, unit: "g" }
                                : candidate
                            )
                          );
                          resetAmountInputs(item.foodId);
                        }
                        return;
                      }
                      setItems((current) =>
                        current.map((candidate) =>
                          candidate.foodId === item.foodId
                            ? {
                                ...candidate,
                                grams: serving.grams,
                                unit: serving.name.slice(0, 40),
                              }
                            : candidate
                        )
                      );
                      resetAmountInputs(item.foodId);
                    }}
                  >
                    <option value="g">Custom grams</option>
                    {item.food.servings.map((serving) => (
                      <option
                        key={`${serving.name}:${serving.grams}`}
                        value={serving.name.slice(0, 40)}
                      >
                        {serving.name} · {format(serving.grams)} g
                      </option>
                    ))}
                  </select>
                </Label>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
