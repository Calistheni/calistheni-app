"use client";

import { App } from "@capacitor/app";
import dynamic from "next/dynamic";
import {
  Bookmark,
  BookmarkX,
  CopyPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { NutritionDateNavigator } from "@/components/nutrition/NutritionDateNavigator";
import { NutritionGoalCard } from "@/components/nutrition/NutritionGoalCard";
import { NutritionMobileSheet } from "@/components/nutrition/NutritionMobileSheet";
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
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { localNutritionDateKey } from "@/lib/nutrition/date-navigation";
import { parseNutritionAmount } from "@/lib/nutrition/amount-input";
import { nutritionTotals } from "@/lib/nutrition/log";
import {
  calculateNutritionGoalProgress,
  type NutritionGoalProgress,
  type NutritionGoalValues,
} from "@/lib/nutrition/goals";
import { isNativeApp } from "@/lib/native/platform";

const FoodPicker = dynamic(
  () =>
    import("@/components/nutrition/FoodPicker").then((mod) => mod.FoodPicker),
  { ssr: false, loading: () => <FoodPickerLoading /> }
);

const FoodDetailsDialog = dynamic(
  () =>
    import("@/components/nutrition/FoodDetailsDialog").then(
      (mod) => mod.FoodDetailsDialog
    ),
  { ssr: false }
);

type Meal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACKS";

type Entry = {
  id: string;
  foodId: string;
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
    genericIcon?: { key?: string; url: string } | null;
  };
};

type NutritionGoal = NutritionGoalValues & { effectiveFrom?: string };

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

function toGoal(
  value: Record<string, unknown> | null | undefined
): NutritionGoal | null {
  if (!value) return null;
  const goal = {
    caloriesKcal: Number(value.caloriesKcal),
    proteinGrams: Number(value.proteinGrams),
    carbohydrateGrams: Number(value.carbohydrateGrams),
    fatGrams: Number(value.fatGrams),
    effectiveFrom:
      typeof value.effectiveFrom === "string" ? value.effectiveFrom : undefined,
  };
  return [
    goal.caloriesKcal,
    goal.proteinGrams,
    goal.carbohydrateGrams,
    goal.fatGrams,
  ].every((number) => Number.isFinite(number) && number > 0)
    ? goal
    : null;
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

function FoodPickerLoading() {
  return (
    <Sheet open>
      <NutritionMobileSheet
        header={
          <SheetHeader>
            <SheetTitle>Add food</SheetTitle>
            <SheetDescription>Preparing your food picker.</SheetDescription>
          </SheetHeader>
        }
      >
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </NutritionMobileSheet>
    </Sheet>
  );
}

export function NutritionTracker() {
  const initialToday = localNutritionDateKey();
  const [date, setDate] = useState(initialToday);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [goal, setGoal] = useState<NutritionGoal | null>(null);
  const [currentGoal, setCurrentGoal] = useState<NutritionGoal | null>(null);
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0);
  const [mode, setMode] = useState<"consumed" | "remaining">("consumed");
  const [meal, setMeal] = useState<Meal | null>(null);
  const [breakdown, setBreakdown] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [inspectingEntry, setInspectingEntry] = useState<Entry | null>(null);
  const [reusingEntry, setReusingEntry] = useState<Entry | null>(null);
  const [reuseMeal, setReuseMeal] = useState<Meal>("BREAKFAST");
  const [savedFoodIds, setSavedFoodIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pickerKey, setPickerKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef(0);
  const savedFoodsLoaded = useRef(false);
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
      const resolvedGoal = toGoal(data.goal ?? data.targets);
      setGoal(resolvedGoal);
      if (dateKey === localNutritionDateKey()) setCurrentGoal(resolvedGoal);
    } catch (error) {
      if (requestId === activeRequest.current) {
        toast.error(
          error instanceof Error ? error.message : "Unable to load nutrition."
        );
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
  const ensureSavedFoodIds = useCallback(async () => {
    if (savedFoodsLoaded.current) return;
    const response = await fetch("/api/nutrition/saved-foods", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    savedFoodsLoaded.current = true;
    setSavedFoodIds(
      new Set(
        (data.foods ?? [])
          .map((food: { id?: string }) => food.id)
          .filter(Boolean)
      )
    );
  }, []);

  const reconcileForReturn = useCallback(() => {
    const now = Date.now();
    if (now - lastLifecycleRefreshRef.current < 1_500) return;
    lastLifecycleRefreshRef.current = now;

    const currentToday = localNutritionDateKey();
    const wasViewingToday =
      selectedDateRef.current === lastKnownTodayRef.current;
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
  const progress = useMemo<NutritionGoalProgress | null>(
    () => (goal ? calculateNutritionGoalProgress(total, goal) : null),
    [goal, total]
  );

  const applyServerEntries = useCallback(
    (created: Entry[]) => {
      setEntries((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        created.forEach((entry) => byId.set(entry.id, entry));
        return [...byId.values()];
      });
      void refreshNutritionDay(selectedDateRef.current);
      setCalendarRefreshToken((value) => value + 1);
    },
    [refreshNutritionDay]
  );

  const updateEntry = useCallback(
    (entry: Entry) => {
      setEntries((current) =>
        current.map((item) => (item.id === entry.id ? entry : item))
      );
      void refreshNutritionDay(selectedDateRef.current);
      setCalendarRefreshToken((value) => value + 1);
    },
    [refreshNutritionDay]
  );

  const deleteEntry = useCallback(
    async (id: string) => {
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
      setCalendarRefreshToken((value) => value + 1);
    },
    [entries, refreshNutritionDay]
  );
  async function reuseEntryToday() {
    if (!reusingEntry) return;
    const response = await fetch("/api/user/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        foodId: reusingEntry.foodId,
        date: localNutritionDateKey(),
        mealCategory: reuseMeal,
        gramsConsumed: Number(reusingEntry.gramsConsumed),
        quantity: Number(reusingEntry.quantity),
        unit: reusingEntry.unit,
      }),
    });
    if (!response.ok) return toast.error("Unable to reuse this food.");
    setReusingEntry(null);
    setCalendarRefreshToken((value) => value + 1);
    toast.success(
      `Added ${reusingEntry.foodNameSnapshot} to ${reuseMeal.toLowerCase()}.`
    );
  }
  async function saveFood(entry: Entry) {
    const saved = savedFoodIds.has(entry.foodId);
    const response = await fetch(
      saved
        ? `/api/nutrition/saved-foods/${entry.foodId}`
        : "/api/nutrition/saved-foods",
      saved
        ? { method: "DELETE" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ foodId: entry.foodId }),
          }
    );
    if (!response.ok) return toast.error("Unable to save this food.");
    setSavedFoodIds((current) => {
      const next = new Set(current);
      if (saved) next.delete(entry.foodId);
      else next.add(entry.foodId);
      return next;
    });
    toast.success(
      saved
        ? `${entry.foodNameSnapshot} removed from saved foods.`
        : `${entry.foodNameSnapshot} saved.`
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Nutrition</h1>
        <p className="text-sm text-muted-foreground">Your daily food log</p>
      </header>

      <NutritionDateNavigator
        selectedDate={date}
        onSelectDate={setDate}
        refreshToken={calendarRefreshToken}
      />

      <NutritionGoalCard
        goal={goal}
        currentGoal={currentGoal}
        isHistoricalDate={date < today}
        progress={progress}
        onSaved={(nextGoal) => {
          setCurrentGoal(nextGoal);
          if (selectedDateRef.current === localNutritionDateKey())
            setGoal(nextGoal);
          setCalendarRefreshToken((value) => value + 1);
          void refreshNutritionDay(selectedDateRef.current);
        }}
      />

      <Summary
        total={total}
        goal={goal}
        progress={progress}
        mode={mode}
        loading={loading}
        setMode={setMode}
        onBreakdown={() => setBreakdown(true)}
      />

      {isFuture ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Future days are available to view. Food logging is available for today
          and earlier dates.
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
                onInspectFood={setInspectingEntry}
                isHistorical={date < today}
                onUse={(entry) => {
                  setReuseMeal(entry.mealCategory);
                  setReusingEntry(entry);
                }}
                onSave={saveFood}
                savedFoodIds={savedFoodIds}
                onActionMenuOpen={ensureSavedFoodIds}
              />
            ))}
      </div>

      <Breakdown
        open={breakdown}
        setOpen={setBreakdown}
        total={total}
        goal={goal}
        loading={loading}
      />
      {meal ? (
        <FoodPicker
          key={pickerKey}
          meal={meal}
          date={date}
          close={() => setMeal(null)}
          onAddEntries={applyServerEntries}
        />
      ) : null}
      {editing ? (
        <EntryEditor
          key={editing.id}
          entry={editing}
          date={date}
          close={() => setEditing(null)}
          onUpdate={updateEntry}
        />
      ) : null}
      {inspectingEntry ? (
        <FoodDetailsDialog
          food={{
            id: inspectingEntry.foodId,
            externalId: inspectingEntry.foodId,
            isLocal: true,
            name: inspectingEntry.foodNameSnapshot,
            genericIcon: inspectingEntry.foodVisual?.genericIcon,
          }}
          open
          onOpenChange={(open) => {
            if (!open) setInspectingEntry(null);
          }}
          mode="inspect"
        />
      ) : null}
      <Dialog
        open={Boolean(reusingEntry)}
        onOpenChange={(open) => !open && setReusingEntry(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use food today</DialogTitle>
            <DialogDescription>
              {reusingEntry
                ? `${reusingEntry.foodNameSnapshot} · ${format(
                    Number(reusingEntry.gramsConsumed)
                  )} g. Previously logged in ${reusingEntry.mealCategory.toLowerCase()}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <Label>
            Add to
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              value={reuseMeal}
              onChange={(event) => setReuseMeal(event.target.value as Meal)}
            >
              {meals.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Label>
          <Button onClick={() => void reuseEntryToday()}>Add food</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({
  total,
  goal,
  progress,
  mode,
  loading,
  setMode,
  onBreakdown,
}: {
  total: Record<string, number>;
  goal: NutritionGoal | null;
  progress: NutritionGoalProgress | null;
  mode: "consumed" | "remaining";
  loading: boolean;
  setMode: (value: "consumed" | "remaining") => void;
  onBreakdown: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div
            className="inline-flex rounded-lg bg-muted p-1"
            role="tablist"
            aria-label="Nutrition summary mode"
          >
            <Button
              size="sm"
              variant={mode === "consumed" ? "default" : "ghost"}
              onClick={() => setMode("consumed")}
            >
              Consumed
            </Button>
            <Button
              size="sm"
              variant={mode === "remaining" ? "default" : "ghost"}
              onClick={() => setMode("remaining")}
            >
              Remaining
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onBreakdown}
          >
            Breakdown
          </Button>
        </div>
        {loading ? (
          <Skeleton className="mt-4 h-20 w-full" />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {nutritionFields.map(([label, key, unit]) => {
              const target = goal?.[key];
              const consumed = total[key] ?? 0;
              const over =
                mode === "remaining" && target != null && consumed > target;
              const value =
                mode === "consumed"
                  ? consumed
                  : target == null
                  ? null
                  : Math.max(0, target - consumed);
              return (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p
                    className={
                      over ? "font-bold text-destructive" : "font-bold"
                    }
                  >
                    {value == null ? "Set target" : `${format(value)} ${unit}`}
                  </p>
                  {over ? (
                    <p className="text-xs text-destructive">
                      {format(consumed - target!)} over
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {goal && progress && !loading ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">Daily goal</p>
              <p className="text-sm text-muted-foreground">
                {Math.round(progress.overallDisplayProgress * 100)}%
              </p>
            </div>
            {nutritionFields.map(([label, key, unit]) => {
              const target = progress.targets[key];
              return (
                <div key={key}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{label}</span>
                    <span className="font-medium">
                      {format(target.actual)} / {format(target.target)} {unit}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${target.displayProgress * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {progress.complete ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
                Daily goal complete
              </p>
            ) : null}
          </div>
        ) : null}
        {mode === "remaining" && !goal && !loading ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Set a nutrition goal to track daily progress.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MealSection({
  label,
  entries,
  disabled,
  onAdd,
  onEdit,
  onDelete,
  onInspectFood,
  isHistorical,
  onUse,
  onSave,
  savedFoodIds,
  onActionMenuOpen,
}: {
  label: string;
  entries: Entry[];
  disabled: boolean;
  onAdd: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onInspectFood: (entry: Entry) => void;
  isHistorical: boolean;
  onUse: (entry: Entry) => void;
  onSave: (entry: Entry) => void;
  savedFoodIds: Set<string>;
  onActionMenuOpen: () => Promise<void>;
}) {
  const total = nutritionTotals(entries);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center">
          <div className="flex-1">
            <h2 className="font-semibold">{label}</h2>
            <p className="text-sm text-muted-foreground">
              {format(total.caloriesKcal ?? 0, 0)} kcal · P{" "}
              {format(total.proteinGrams ?? 0)} · C{" "}
              {format(total.carbohydrateGrams ?? 0)} · F{" "}
              {format(total.fatGrams ?? 0)}
            </p>
          </div>
          <Button
            size="icon-sm"
            aria-label={`Add food to ${label}`}
            title={
              disabled
                ? "Food logging is unavailable for future dates"
                : undefined
            }
            disabled={disabled}
            onClick={onAdd}
          >
            <Plus />
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"
            >
              <button
                type="button"
                className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`View details for ${entry.foodNameSnapshot}`}
                onClick={() => onInspectFood(entry)}
              >
                <FoodVisual
                  imageUrl={entry.foodVisual?.imageUrl}
                  iconPath={entry.foodVisual?.genericIcon?.url}
                  name={entry.foodNameSnapshot}
                  size="sm"
                />
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onEdit(entry)}
              >
                <p className="truncate text-sm font-medium">
                  {entry.foodNameSnapshot}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(Number(entry.gramsConsumed))} g ·{" "}
                  {format(Number(entry.caloriesKcalSnapshot ?? 0), 0)} kcal · P{" "}
                  {format(Number(entry.proteinGramsSnapshot ?? 0))} · C{" "}
                  {format(Number(entry.carbohydrateGramsSnapshot ?? 0))} · F{" "}
                  {format(Number(entry.fatGramsSnapshot ?? 0))}
                </p>
              </button>
              <DropdownMenu
                onOpenChange={(open) => {
                  if (open) void onActionMenuOpen();
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Actions for ${entry.foodNameSnapshot}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(entry)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  {isHistorical ? (
                    <DropdownMenuItem onSelect={() => onUse(entry)}>
                      <CopyPlus /> Use
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => onSave(entry)}>
                    {savedFoodIds.has(entry.foodId) ? (
                      <BookmarkX />
                    ) : (
                      <Bookmark />
                    )}{" "}
                    {savedFoodIds.has(entry.foodId)
                      ? "Remove from saved"
                      : "Save"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(entry.id)}
                  >
                    <Trash2 /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Breakdown({
  open,
  setOpen,
  total,
  goal,
  loading,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  total: Record<string, number>;
  goal: NutritionGoal | null;
  loading: boolean;
}) {
  const rows = [
    ...nutritionFields,
    ["Fiber", "fiberGrams", "g"],
    ["Sugar", "sugarGrams", "g"],
    ["Saturated fat", "saturatedFatGrams", "g"],
    ["Sodium", "sodiumMg", "mg"],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Daily breakdown</DialogTitle>
          <DialogDescription>
            Consumed nutrition for the selected day.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-3">
            {rows.map(([label, key, unit]) => {
              const amount = total[key] ?? 0;
              const target = goal?.[key as keyof NutritionGoalValues];
              return (
                <div key={key} className="flex justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <span className="text-right font-medium">
                    {format(amount)} {unit}
                    {target != null ? ` / ${format(target)} ${unit}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* The picker was extracted to FoodPicker.tsx so the Nutrition route does not
 * ship food search, scanner, or AI review code until the user opens Add food.
function FoodPicker({
  meal,
  date,
  close,
  onAddEntries,
  quickActionCapabilities,
}: {
  meal: Meal | null;
  date: string;
  close: () => void;
  onAddEntries: (entries: Entry[]) => void;
  quickActionCapabilities: {
    canUseAiScan: boolean;
    canUseBarcodeScan: boolean;
  };
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [inspectedFood, setInspectedFood] = useState<Food | null>(null);
  const [quickAdding, setQuickAdding] = useState<string | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);

  useEffect(() => {
    if (!meal) return;
    const timer = window.setTimeout(async () => {
      const isSearching = query.trim().length >= 2;
      const path = isSearching
        ? `/api/nutrition/foods/search?q=${encodeURIComponent(query.trim())}`
        : "/api/nutrition/saved-foods";
      setSavedLoading(!isSearching);
      const response = await fetch(path, { cache: "no-store" });
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
      setSavedLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
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
            <NutritionQuickActions
              meal={meal!}
              date={date}
              onEntries={(created) => onAddEntries(created as Entry[])}
              capabilities={quickActionCapabilities}
            />
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
                  onEntries={(created) => onAddEntries(created as Entry[])}
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
*/

function EntryEditor({
  entry,
  date,
  close,
  onUpdate,
}: {
  entry: Entry | null;
  date: string;
  close: () => void;
  onUpdate: (entry: Entry) => void;
}) {
  const [grams, setGrams] = useState(() => String(entry?.gramsConsumed ?? ""));
  const [meal, setMeal] = useState<Meal>(() => entry?.mealCategory ?? "SNACKS");
  async function save() {
    if (!entry) return;
    const gramsConsumed = parseNutritionAmount(grams);
    if (gramsConsumed === null) {
      toast.error("Enter a valid amount greater than 0 g.");
      return;
    }
    const response = await fetch(`/api/user/nutrition/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        gramsConsumed,
        mealCategory: meal,
      }),
    });
    if (!response.ok) return toast.error("Unable to update food.");
    onUpdate(await response.json());
    close();
  }
  return (
    <Dialog open={Boolean(entry)} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit food</DialogTitle>
          <DialogDescription>Update the amount or meal.</DialogDescription>
        </DialogHeader>
        <Label>
          Grams
          <Input
            type="text"
            inputMode="decimal"
            className="text-base"
            value={grams}
            onChange={(event) => setGrams(event.target.value)}
          />
        </Label>
        <select
          className="h-10 rounded-md border bg-background px-2"
          value={meal}
          onChange={(event) => setMeal(event.target.value as Meal)}
        >
          {meals.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button onClick={() => void save()}>Save changes</Button>
      </DialogContent>
    </Dialog>
  );
}
