"use client";

import { App } from "@capacitor/app";
import { MoreHorizontal, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { NutritionDateNavigator } from "@/components/nutrition/NutritionDateNavigator";
import { NutritionQuickActions } from "@/components/nutrition/NutritionQuickActions";
import { NutritionSavedMeals } from "@/components/nutrition/NutritionSavedMeals";
import { FoodVisual } from "@/components/nutrition/FoodVisual";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  localNutritionDateKey,
} from "@/lib/nutrition/date-navigation";
import { nutritionTotals } from "@/lib/nutrition/log";
import { deduplicateFoodResults, foodResultKey } from "@/lib/nutrition/result-identity";
import { isNativeApp } from "@/lib/native/platform";

type Meal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACKS";

type Food = {
  id?: string;
  provider?: "USDA" | "OPEN_FOOD_FACTS";
  source?: string;
  externalId: string;
  name: string;
  brandName?: string | null;
  imageUrl?: string | null;
  genericIcon?: { url: string } | null;
  nutritionPer100g: Record<string, number | undefined>;
};

type Entry = {
  id: string;
  mealCategory: Meal;
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
    genericIcon?: { url: string } | null;
  };
};

type NutritionTargets = Record<string, number | null> | null;

const meals: Array<[Meal, string]> = [
  ["BREAKFAST", "Breakfast"],
  ["LUNCH", "Lunch"],
  ["DINNER", "Dinner"],
  ["SNACKS", "Snacks"],
];

const nutritionFields = [
  ["Calories", "caloriesKcal", "kcal"],
  ["Protein", "proteinGrams", "g"],
  ["Carbs", "carbohydrateGrams", "g"],
  ["Fat", "fatGrams", "g"],
] as const;

function format(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function toTargets(value: Record<string, unknown> | null | undefined): NutritionTargets {
  if (!value) return null;

  return {
    caloriesKcal: Number(value.caloriesKcal ?? 0) || null,
    proteinGrams: Number(value.proteinGrams ?? 0) || null,
    carbohydrateGrams: Number(value.carbohydrateGrams ?? 0) || null,
    fatGrams: Number(value.fatGrams ?? 0) || null,
  };
}

function NutritionSectionSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-full" />
      </CardContent>
    </Card>
  );
}

export function NutritionTracker({
  quickActionCapabilities,
}: {
  quickActionCapabilities: {
    canUseAiScan: boolean;
    canUseBarcodeScan: boolean;
  };
}) {
  const initialToday = localNutritionDateKey();
  const [date, setDate] = useState(initialToday);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [targets, setTargets] = useState<NutritionTargets>(null);
  const [mode, setMode] = useState<"consumed" | "remaining">("consumed");
  const [meal, setMeal] = useState<Meal | null>(null);
  const [breakdown, setBreakdown] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef(0);
  const selectedDateRef = useRef(date);
  const lastKnownTodayRef = useRef(initialToday);
  const lastLifecycleRefreshRef = useRef(0);

  const today = localNutritionDateKey();
  const isFuture = date > today;

  useEffect(() => {
    selectedDateRef.current = date;
  }, [date]);

  const refreshNutritionDay = useCallback(async (dateKey: string) => {
    const requestId = ++activeRequest.current;
    setLoading(true);

    try {
      const response = await fetch(
        `/api/user/nutrition?date=${encodeURIComponent(dateKey)}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Unable to load nutrition.");
      const data = await response.json();

      if (requestId !== activeRequest.current) return;
      setEntries(data.entries as Entry[]);
      setTargets(toTargets(data.targets));
    } catch (error) {
      if (requestId === activeRequest.current) {
        toast.error(error instanceof Error ? error.message : "Unable to load nutrition.");
      }
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshNutritionDay(date);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [date, refreshNutritionDay]);

  const reconcileForReturn = useCallback(() => {
    const now = Date.now();
    if (now - lastLifecycleRefreshRef.current < 1_500) return;
    lastLifecycleRefreshRef.current = now;

    const currentToday = localNutritionDateKey();
    const wasViewingToday = selectedDateRef.current === lastKnownTodayRef.current;
    lastKnownTodayRef.current = currentToday;

    if (wasViewingToday && selectedDateRef.current !== currentToday) {
      setDate(currentToday);
      return;
    }

    void refreshNutritionDay(selectedDateRef.current);
  }, [refreshNutritionDay]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reconcileForReturn();
    };

    window.addEventListener("focus", reconcileForReturn);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", reconcileForReturn);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reconcileForReturn]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let listener: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) reconcileForReturn();
    }).then((registered) => {
      listener = registered;
    });

    return () => {
      void listener?.remove();
    };
  }, [reconcileForReturn]);

  const total = useMemo(() => nutritionTotals(entries), [entries]);

  const applyServerEntries = useCallback((created: Entry[]) => {
    setEntries((current) => {
      const byId = new Map(current.map((entry) => [entry.id, entry]));
      created.forEach((entry) => byId.set(entry.id, entry));
      return [...byId.values()];
    });
    void refreshNutritionDay(selectedDateRef.current);
  }, [refreshNutritionDay]);

  const updateEntry = useCallback((entry: Entry) => {
    setEntries((current) => current.map((item) => item.id === entry.id ? entry : item));
    void refreshNutritionDay(selectedDateRef.current);
  }, [refreshNutritionDay]);

  const deleteEntry = useCallback(async (id: string) => {
    const before = entries;
    setEntries((current) => current.filter((entry) => entry.id !== id));

    const response = await fetch(`/api/user/nutrition/${id}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (!response.ok) {
      setEntries(before);
      toast.error("Unable to delete food.");
      return;
    }

    void refreshNutritionDay(selectedDateRef.current);
  }, [entries, refreshNutritionDay]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Nutrition</h1>
        <p className="text-sm text-muted-foreground">Your daily food log</p>
      </header>

      <NutritionDateNavigator selectedDate={date} onSelectDate={setDate} />

      <Summary
        total={total}
        targets={targets}
        mode={mode}
        loading={loading}
        setMode={setMode}
        onBreakdown={() => setBreakdown(true)}
      />

      {isFuture ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Future days are available to view. Food logging is available for today and earlier dates.
        </p>
      ) : null}

      <div className="space-y-3" aria-busy={loading}>
        {loading
          ? meals.map(([id]) => <NutritionSectionSkeleton key={id} />)
          : meals.map(([id, label]) => (
              <MealSection
                key={id}
                label={label}
                entries={entries.filter((entry) => entry.mealCategory === id)}
                disabled={isFuture}
                onAdd={() => {
                  setPickerKey((value) => value + 1);
                  setMeal(id);
                }}
                onEdit={setEditing}
                onDelete={deleteEntry}
              />
            ))}
      </div>

      <Breakdown
        open={breakdown}
        setOpen={setBreakdown}
        total={total}
        targets={targets}
        loading={loading}
      />
      <FoodPicker
        key={pickerKey}
        meal={meal}
        date={date}
        close={() => setMeal(null)}
        onAddEntries={applyServerEntries}
        quickActionCapabilities={quickActionCapabilities}
      />
      <EntryEditor
        key={editing?.id ?? "empty"}
        entry={editing}
        date={date}
        close={() => setEditing(null)}
        onUpdate={updateEntry}
      />
    </div>
  );
}

function Summary({
  total,
  targets,
  mode,
  loading,
  setMode,
  onBreakdown,
}: {
  total: Record<string, number>;
  targets: NutritionTargets;
  mode: "consumed" | "remaining";
  loading: boolean;
  setMode: (value: "consumed" | "remaining") => void;
  onBreakdown: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-muted p-1" role="tablist" aria-label="Nutrition summary mode">
            <Button size="sm" variant={mode === "consumed" ? "default" : "ghost"} onClick={() => setMode("consumed")}>Consumed</Button>
            <Button size="sm" variant={mode === "remaining" ? "default" : "ghost"} onClick={() => setMode("remaining")}>Remaining</Button>
          </div>
          <Button variant="outline" size="sm" disabled={loading} onClick={onBreakdown}>Breakdown</Button>
        </div>
        {loading ? <Skeleton className="mt-4 h-20 w-full" /> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {nutritionFields.map(([label, key, unit]) => {
            const target = targets?.[key];
            const consumed = total[key] ?? 0;
            const over = mode === "remaining" && target != null && consumed > target;
            const value = mode === "consumed" ? consumed : target == null ? null : Math.max(0, target - consumed);
            return <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={over ? "font-bold text-destructive" : "font-bold"}>{value == null ? "Set target" : `${format(value)} ${unit}`}</p>
              {over ? <p className="text-xs text-destructive">{format(consumed - target!)} over</p> : null}
            </div>;
          })}
        </div>}
        {mode === "remaining" && !targets && !loading ? <Button className="mt-3" size="sm" variant="outline" onClick={() => toast.message("Nutrition targets can be added from your nutrition settings.")}>Set nutrition targets</Button> : null}
      </CardContent>
    </Card>
  );
}

function MealSection({ label, entries, disabled, onAdd, onEdit, onDelete }: { label: string; entries: Entry[]; disabled: boolean; onAdd: () => void; onEdit: (entry: Entry) => void; onDelete: (id: string) => void }) {
  const total = nutritionTotals(entries);
  return <Card><CardContent className="p-4"><div className="flex items-center"><div className="flex-1"><h2 className="font-semibold">{label}</h2><p className="text-sm text-muted-foreground">{format(total.caloriesKcal ?? 0, 0)} kcal · P {format(total.proteinGrams ?? 0)} · C {format(total.carbohydrateGrams ?? 0)} · F {format(total.fatGrams ?? 0)}</p></div><Button size="icon-sm" aria-label={`Add food to ${label}`} title={disabled ? "Food logging is unavailable for future dates" : undefined} disabled={disabled} onClick={onAdd}><Plus /></Button></div><div className="mt-3 space-y-2">{entries.map((entry) => <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"><FoodVisual imageUrl={entry.foodVisual?.imageUrl} iconPath={entry.foodVisual?.genericIcon?.url} name={entry.foodNameSnapshot} size="sm" /><button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(entry)}><p className="truncate text-sm font-medium">{entry.foodNameSnapshot}</p><p className="text-xs text-muted-foreground">{format(Number(entry.gramsConsumed))} g · {format(Number(entry.caloriesKcalSnapshot ?? 0), 0)} kcal · P {format(Number(entry.proteinGramsSnapshot ?? 0))} · C {format(Number(entry.carbohydrateGramsSnapshot ?? 0))} · F {format(Number(entry.fatGramsSnapshot ?? 0))}</p></button><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Actions for ${entry.foodNameSnapshot}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(entry)}>Edit</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => onDelete(entry.id)}>Remove</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}</div></CardContent></Card>;
}

function Breakdown({ open, setOpen, total, targets, loading }: { open: boolean; setOpen: (open: boolean) => void; total: Record<string, number>; targets: NutritionTargets; loading: boolean }) {
  const rows = [...nutritionFields, ["Fiber", "fiberGrams", "g"], ["Sugar", "sugarGrams", "g"], ["Saturated fat", "saturatedFatGrams", "g"], ["Sodium", "sodiumMg", "mg"]] as const;
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Daily breakdown</DialogTitle><DialogDescription>Consumed nutrition for the selected day.</DialogDescription></DialogHeader>{loading ? <Skeleton className="h-48 w-full" /> : <div className="space-y-3">{rows.map(([label, key, unit]) => { const amount = total[key] ?? 0; const target = targets?.[key]; return <div key={key} className="flex justify-between gap-3 text-sm"><span>{label}</span><span className="text-right font-medium">{format(amount)} {unit}{target != null ? ` / ${format(target)} ${unit}` : ""}</span></div>; })}</div>}</DialogContent></Dialog>;
}

function FoodPicker({ meal, date, close, onAddEntries, quickActionCapabilities }: { meal: Meal | null; date: string; close: () => void; onAddEntries: (entries: Entry[]) => void; quickActionCapabilities: { canUseAiScan: boolean; canUseBarcodeScan: boolean } }) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");

  useEffect(() => {
    if (!meal) return;
    const timer = window.setTimeout(async () => {
      const path = query.trim().length >= 2 ? `/api/nutrition/foods/search?q=${encodeURIComponent(query.trim())}` : "/api/nutrition/foods/common";
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setFoods(deduplicateFoodResults(query.trim().length >= 2 ? [...(data.genericResults ?? []), ...(data.localResults ?? []), ...(data.packagedResults ?? [])] : data.foods ?? []));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [meal, query]);

  const nutrition = selected ? Object.fromEntries(Object.entries(selected.nutritionPer100g).map(([key, value]) => [key, Number(value ?? 0) * Number(grams) / 100])) : {};
  async function choose(food: Food) { if (food.id) { setSelected(food); return; } if (!food.provider) return; const response = await fetch("/api/nutrition/foods/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: food.provider, externalId: food.externalId }) }); if (!response.ok) return toast.error("Unable to import food."); setSelected((await response.json()).food); }
  function dismiss() { setQuery(""); setFoods([]); setSelected(null); setGrams("100"); close(); }
  async function add() { if (!selected?.id || !meal) return; const response = await fetch("/api/user/nutrition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foodId: selected.id, date, mealCategory: meal, gramsConsumed: Number(grams), quantity: 1, unit: "g" }) }); if (!response.ok) return toast.error("Unable to add food."); onAddEntries([await response.json()]); dismiss(); }
  return <Sheet open={Boolean(meal)} onOpenChange={(value) => !value && dismiss()}><SheetContent side="bottom" className="h-[92dvh] overflow-y-auto"><SheetHeader><SheetTitle>{selected ? `Add ${selected.name}` : `Add to ${meal?.toLowerCase()}`}</SheetTitle><SheetDescription>{selected ? "Choose an amount before logging." : "Search and choose a food."}</SheetDescription></SheetHeader>{selected ? <div className="space-y-4 p-4"><Label htmlFor="nutrition-grams">Amount in grams</Label><Input id="nutrition-grams" type="number" min="1" value={grams} onChange={(event) => setGrams(event.target.value)} /><div className="grid grid-cols-2 gap-2 text-sm">{nutritionFields.map(([label, key, unit]) => <Card key={key}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{format(Number(nutrition[key] ?? 0))} {unit}</p></CardContent></Card>)}</div><Button className="w-full" onClick={() => void add()}>Add to {meal?.charAt(0)}{meal?.slice(1).toLowerCase()}</Button></div> : <div className="space-y-4 p-4"><Input autoFocus placeholder="Search foods" aria-label="Search foods" value={query} onChange={(event) => setQuery(event.target.value)} /><NutritionQuickActions meal={meal!} date={date} onEntries={(created) => onAddEntries(created as Entry[])} capabilities={quickActionCapabilities} /><Tabs defaultValue="food"><TabsList className="w-full"><TabsTrigger className="flex-1" value="food">Food</TabsTrigger><TabsTrigger className="flex-1" value="meals">Meals</TabsTrigger><TabsTrigger className="flex-1" value="recipes">Recipes</TabsTrigger></TabsList><TabsContent value="food" className="space-y-2">{foods.map((food) => <button key={foodResultKey(food)} type="button" className="flex w-full min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void choose(food)}><FoodVisual imageUrl={food.imageUrl} iconPath={food.genericIcon?.url} name={food.name} size="sm" /><span className="min-w-0 flex-1"><span className="line-clamp-2 block font-medium">{food.name}</span><span className="mt-1 block text-xs text-muted-foreground">{food.brandName ? `${food.brandName} · ` : ""}{format(Number(food.nutritionPer100g.caloriesKcal ?? 0))} kcal · P {format(Number(food.nutritionPer100g.proteinGrams ?? 0))} · C {format(Number(food.nutritionPer100g.carbohydrateGrams ?? 0))} · F {format(Number(food.nutritionPer100g.fatGrams ?? 0))} per 100 g</span></span></button>)}</TabsContent><TabsContent value="meals"><NutritionSavedMeals mealCategory={meal!} date={date} onEntries={(created) => onAddEntries(created as Entry[])} /></TabsContent><TabsContent value="recipes"><Empty title="No recipes yet" text="Create a recipe and define its ingredients and servings." action="Create recipe" /></TabsContent></Tabs></div>}</SheetContent></Sheet>;
}

function Empty({ title, text, action }: { title: string; text: string; action: string }) { return <div className="py-10 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p><Button className="mt-3" variant="outline" onClick={() => toast.message(`${action} is coming soon.`)}><Plus />{action}</Button></div>; }

function EntryEditor({ entry, date, close, onUpdate }: { entry: Entry | null; date: string; close: () => void; onUpdate: (entry: Entry) => void }) {
  const [grams, setGrams] = useState(() => String(entry?.gramsConsumed ?? ""));
  const [meal, setMeal] = useState<Meal>(() => entry?.mealCategory ?? "SNACKS");
  async function save() { if (!entry) return; const response = await fetch(`/api/user/nutrition/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, gramsConsumed: Number(grams), mealCategory: meal }) }); if (!response.ok) return toast.error("Unable to update food."); onUpdate(await response.json()); close(); }
  return <Dialog open={Boolean(entry)} onOpenChange={(value) => !value && close()}><DialogContent><DialogHeader><DialogTitle>Edit food</DialogTitle><DialogDescription>Update the amount or meal.</DialogDescription></DialogHeader><Label>Grams<Input type="number" min="1" value={grams} onChange={(event) => setGrams(event.target.value)} /></Label><select className="h-10 rounded-md border bg-background px-2" value={meal} onChange={(event) => setMeal(event.target.value as Meal)}>{meals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button onClick={() => void save()}>Save changes</Button></DialogContent></Dialog>;
}
