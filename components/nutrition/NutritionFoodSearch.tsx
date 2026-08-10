"use client";

import { Barcode, Database, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  contributionStatus?: string | null;
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

function proposalNeedsNutritionReview(proposal: Record<string, unknown>) {
  const nutrition = proposal.nutrition as Record<string, unknown> | undefined;
  if (!nutrition) return false;
  const calories = Number(nutrition.caloriesKcal);
  const protein = Number(nutrition.proteinGrams);
  const carbs = Number(nutrition.carbohydrateGrams);
  const fat = Number(nutrition.fatGrams);
  if (![calories, protein, carbs, fat].every(Number.isFinite)) return false;
  return Math.abs(protein * 4 + carbs * 4 + fat * 9 - calories) > Math.max(80, calories * 0.6);
}

export function NutritionFoodSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; queryKind?: "GENERIC" | "SPECIFIC_VARIANT" | "PRODUCT" | "BARCODE"; localResults: Result[]; genericResults?: Result[]; packagedResults?: Result[]; externalResults: Result[]; warnings?: string[]; missingIntent?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [selectedFood, setSelectedFood] = useState<Result | null>(null);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState("");
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

  async function startProposal(name: string) {
    if (proposalBusy) return;
    if (process.env.NODE_ENV === "development") console.info("[MissingFood] ADD clicked", { name });
    setProposalError("");
    setProposalBusy(true);
    try {
      if (process.env.NODE_ENV === "development") console.info("[MissingFood] POST /api/nutrition/foods/propose");
      const response = await fetch("/api/nutrition/foods/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", name, context: query }) });
      const data = await response.json();
      if (process.env.NODE_ENV === "development") console.info("[MissingFood] proposal response", { status: response.status, kind: data?.kind ?? null, error: data?.error ?? null });
      if (!response.ok) throw new Error(responseErrorMessage(data, "Unable to prepare a food proposal."));
      if (data.kind === "existing") return void importFood(data.food as Result);
      setProposal(data.proposal);
      if (process.env.NODE_ENV === "development") console.info("[MissingFood] opening review dialog");
    } catch (error) { const message = error instanceof Error ? error.message : "Unable to prepare a food proposal."; setProposalError(message); toast.error(message); }
    finally { setProposalBusy(false); }
  }
  async function saveProposal() {
    if (!proposal) return;
    setProposalBusy(true);
    try {
      const response = await fetch("/api/nutrition/foods/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", proposal }) });
      const data = await response.json();
      if (!response.ok) throw new Error(responseErrorMessage(data, "Unable to save this food."));
      toast.success(data.duplicate ? "We found the existing food." : "Thanks for contributing! This food is now available.");
      setProposal(null);
      void search(query);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save this food."); }
    finally { setProposalBusy(false); }
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
          {results.missingIntent ? <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div><p className="font-medium">{results.missingIntent}</p><p className="text-sm text-muted-foreground">Not in Calistheni yet</p>{proposalBusy ? <p className="mt-1 text-xs text-muted-foreground">Preparing nutrition suggestion…</p> : null}</div>
              <Button disabled={proposalBusy} onClick={() => void startProposal(results.missingIntent!)}>{proposalBusy ? <RefreshCw className="animate-spin" /> : null}ADD</Button>
            </CardContent>
          </Card> : null}
          {proposalError ? <Card><CardContent className="flex items-center justify-between gap-3 p-4 text-sm"><span>{proposalError}</span><Button size="sm" variant="outline" onClick={() => void startProposal(results?.missingIntent ?? query)}>Try again</Button></CardContent></Card> : null}
          {!results.localResults.length && !(results.genericResults ?? results.externalResults).length && !(results.packagedResults ?? []).length ? <Card><CardContent className="p-5 text-sm text-muted-foreground">No food results are available for this query.</CardContent></Card> : null}
        </div>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">Search a food or barcode. External results stay previews until you explicitly import them.</CardContent>
        </Card>
      )}
      <FoodDetailsDialog food={selectedFood} open={Boolean(selectedFood)} onOpenChange={(open) => { if (!open) setSelectedFood(null); }} onImported={() => void search(query)} />
      <Dialog open={Boolean(proposal)} onOpenChange={(open) => { if (!open) setProposal(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add missing food</DialogTitle><DialogDescription>This food isn&apos;t currently available in the Calistheni database. AI values are estimates—please review them before saving.</DialogDescription></DialogHeader>
          {proposal ? <div className="space-y-3">
            <p className="text-sm text-muted-foreground">By adding it, you&apos;re helping Calistheni grow.</p>
            {(["canonicalName", "caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "defaultServingGrams"] as const).map((field) => {
              const nutrition = proposal.nutrition as Record<string, unknown> | undefined;
              const isNutrition = field !== "canonicalName" && field !== "defaultServingGrams";
              const value = isNutrition ? nutrition?.[field] : proposal[field];
              return <Label key={field} className="block text-sm">{field === "canonicalName" ? "Name" : field.replace(/([A-Z])/g, " $1").replace("Kcal", "kcal")}<Input className="mt-1" type={field === "canonicalName" ? "text" : "number"} min="0" value={String(value ?? "")} onChange={(event) => setProposal((current) => { if (!current) return current; if (isNutrition) return { ...current, nutrition: { ...(current.nutrition as Record<string, unknown>), [field]: Number(event.target.value) } }; return { ...current, [field]: field === "canonicalName" ? event.target.value : Number(event.target.value) }; })} /></Label>;
            })}
            <p className="text-xs text-muted-foreground">These values are estimated and may be inaccurate. Check a reliable source when possible.</p>
            {proposalNeedsNutritionReview(proposal) ? <p className="text-xs text-amber-700 dark:text-amber-400">These values look inconsistent. Please review them before saving.</p> : null}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setProposal(null)}>Cancel</Button><Button disabled={proposalBusy} onClick={() => void saveProposal()}>Save food</Button></div>
          </div> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
