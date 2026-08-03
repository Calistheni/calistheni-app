"use client";

import { Barcode, Database, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FoodDetailsDialog } from "@/components/nutrition/FoodDetailsDialog";
import { FoodVisual } from "@/components/nutrition/FoodVisual";
import { foodResultClassification, meaningfulFoodBrand } from "@/lib/nutrition/food-display";

type Result = {
  id?: string;
  provider?: "USDA" | "OPEN_FOOD_FACTS";
  externalId: string;
  name: string;
  brandName?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  genericIcon?: { key: string; url: string; match: string } | null;
  source?: string;
  foodType?: "GENERIC" | "BRANDED";
  searchMetadata?: { source: "USDA" | "OPEN_FOOD_FACTS"; isGeneric: boolean; isBranded: boolean; usdaDataType?: string | null };
  verificationStatus: string;
  freshnessStatus?: string;
  confidenceScore: number;
  nutritionPer100g: {
    caloriesKcal?: number;
    proteinGrams?: number;
    carbohydrateGrams?: number;
    fatGrams?: number;
  };
  isComplete?: boolean;
  isLocal?: boolean;
  lastRevalidatedAt?: string | null;
  nextRevalidateAt?: string | null;
  servings?: Array<{ name: string; grams: number }>;
};

function responseErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object" || !("error" in data)) return fallback;
  if (typeof data.error === "string") return data.error;
  if (
    data.error &&
    typeof data.error === "object" &&
    "message" in data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }
  return fallback;
}

function nutritionCompletenessLabel(food: Result) {
  const values = Object.values(food.nutritionPer100g).filter((value) => value !== undefined).length;
  if (food.isComplete) return "Complete nutrition";
  return values > 0 ? "Partial nutrition data" : "Incomplete nutrition data";
}

function freshnessLabel(status: string | undefined) {
  if (!status) return null;
  return status === "FRESH" ? "Recently checked" : status.toLowerCase().replaceAll("_", " ");
}

export function NutritionFoodSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; queryKind?: "GENERIC" | "SPECIFIC_VARIANT" | "PRODUCT" | "BARCODE"; localResults: Result[]; genericResults?: Result[]; packagedResults?: Result[]; externalResults: Result[]; warnings?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [selectedFood, setSelectedFood] = useState<Result | null>(null);
  const activeRequest = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => () => abortController.current?.abort(), []);

  async function search(submittedQuery: string) {
    const requestedQuery = submittedQuery.trim();
    if (requestedQuery.length < 2) return;
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    setLoading(true);
    try {
      const response = await fetch(`/api/nutrition/foods/search?q=${encodeURIComponent(requestedQuery)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(responseErrorMessage(data, "Search failed."));
      if (activeRequest.current === requestId) setResults(data);
    } catch (error) {
      if (activeRequest.current === requestId && !(error instanceof DOMException && error.name === "AbortError")) toast.error(error instanceof Error ? error.message : "Search failed.");
    } finally {
      if (activeRequest.current === requestId) setLoading(false);
    }
  }

  async function importFood(food: Result) {
    if (!food.provider) return;
    try {
      const response = await fetch("/api/nutrition/foods/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: food.provider, externalId: food.externalId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(responseErrorMessage(data, "Import failed."));
      toast.success(`${data.food.name} saved to Calistheni.`);
      void search(query);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    }
  }

  async function lookupBarcode() {
    if (!barcode.trim()) return;
    abortController.current?.abort();
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    setLoading(true);
    try {
      const response = await fetch(`/api/nutrition/foods/barcode/${encodeURIComponent(barcode)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(responseErrorMessage(data, "Barcode lookup failed."));
      if (activeRequest.current === requestId) setResults({ query: barcode, queryKind: "BARCODE", localResults: data.local ? [data.local] : [], genericResults: [], packagedResults: data.external ? [data.external] : [], externalResults: data.external ? [data.external] : [] });
    } catch (error) {
      if (activeRequest.current === requestId) toast.error(error instanceof Error ? error.message : "Barcode lookup failed.");
    } finally { if (activeRequest.current === requestId) setLoading(false); }
  }

  const render = (food: Result) => {
    const serving = food.servings?.find((candidate) => candidate.grams > 0);
    const brandName = meaningfulFoodBrand(food.brandName, food.name);
    const servingCalories = serving && food.nutritionPer100g.caloriesKcal !== undefined
      ? Math.round((food.nutritionPer100g.caloriesKcal * serving.grams) / 100)
      : undefined;
    return (
    <Card key={`${food.provider ?? "local"}:${food.externalId}`}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedFood(food)} aria-label={`View details for ${food.name}`}>
          <FoodVisual imageUrl={food.imageUrl} iconPath={food.genericIcon?.url} name={food.name} size="sm" />
          <span className="min-w-0"><span className="block font-semibold">{food.name}</span><span className="block truncate text-sm text-muted-foreground">{brandName ? `${brandName} · ` : ""}{foodResultClassification(food)}</span><span className="mt-1 block text-xs text-muted-foreground">{food.nutritionPer100g.caloriesKcal ?? "—"} kcal · P {food.nutritionPer100g.proteinGrams ?? "—"} · C {food.nutritionPer100g.carbohydrateGrams ?? "—"} · F {food.nutritionPer100g.fatGrams ?? "—"} per 100 g</span>{serving ? <span className="mt-1 block text-xs text-muted-foreground">Serving: {serving.grams} g{servingCalories !== undefined ? ` · ${servingCalories} kcal` : ""}</span> : null}<span className="mt-1 block text-xs text-muted-foreground">{nutritionCompletenessLabel(food)}{freshnessLabel(food.freshnessStatus) ? ` · ${freshnessLabel(food.freshnessStatus)}` : ""}</span></span>
        </button>
        {food.isLocal ? (
          <Button variant="outline" disabled>
            <Database /> Stored
          </Button>
        ) : (
          <Button onClick={() => void importFood(food)}>Import</Button>
        )}
      </CardContent>
    </Card>
    );
  };

  return (
    <section className="mt-6 space-y-5">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
      >
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods, e.g. salmon" aria-label="Search foods" />
        <Button type="submit" disabled={query.trim().length < 2}>
          {loading ? <RefreshCw className="animate-spin" /> : <Search />} Search
        </Button>
      </form>
      <div className="flex gap-2">
        <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} inputMode="numeric" placeholder="Barcode lookup" aria-label="Barcode" />
        <Button type="button" variant="outline" onClick={() => void lookupBarcode()}>
          <Barcode /> Lookup
        </Button>
      </div>
      {loading && !results ? <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Searching foods…</CardContent></Card> : results ? (
        <div className="space-y-5">
          {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Updating results…</p> : null}
          {results.warnings?.length ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">{results.warnings.join(" ")}</p> : null}
          {results.localResults.length ? <section>
            <h2 className="mb-2 text-lg font-semibold">Local foods</h2>
            <div className="space-y-2">
              {results.localResults.map(render)}
            </div>
          </section> : null}
          {results.queryKind === "PRODUCT" && (results.packagedResults ?? results.externalResults).length ? <section>
            <h2 className="mb-2 text-lg font-semibold">Packaged products</h2>
            <div className="space-y-2">
              {(results.packagedResults ?? results.externalResults).map(render)}
            </div>
          </section> : null}
          {(results.genericResults ?? results.externalResults).length ? <section>
            <h2 className="mb-2 text-lg font-semibold">Generic foods</h2>
            <div className="space-y-2">
              {(results.genericResults ?? results.externalResults).map(render)}
            </div>
          </section> : null}
          {results.queryKind !== "PRODUCT" && (results.packagedResults ?? []).length ? <section>
            <h2 className="mb-2 text-lg font-semibold">Packaged products</h2>
            <div className="space-y-2">
              {(results.packagedResults ?? []).map(render)}
            </div>
          </section> : null}
          {!results.localResults.length && !(results.genericResults ?? results.externalResults).length && !(results.packagedResults ?? []).length ? <Card><CardContent className="p-5 text-sm text-muted-foreground">No food results are available for this query.</CardContent></Card> : null}
        </div>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">Search a food or barcode. External results stay previews until you explicitly import them.</CardContent>
        </Card>
      )}
      <FoodDetailsDialog food={selectedFood} open={Boolean(selectedFood)} onOpenChange={(open) => { if (!open) setSelectedFood(null); }} onImported={() => void search(query)} />
    </section>
  );
}
