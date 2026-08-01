"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { calculateNutritionSnapshot } from "@/lib/nutrition/snapshots";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SearchFood = { id?: string; provider?: "USDA" | "OPEN_FOOD_FACTS"; externalId: string; name: string; isLocal?: boolean };
type Serving = { id: string; name: string; grams: number };
type FoodDetail = {
  name: string; brandName: string | null; images: { front: string | null; nutrition: string | null; ingredients: string | null }; package: { quantityText: string | null }; servings: Serving[];
  nutritionPer100g: Record<string, number | undefined>; ingredients: { text: string | null; allergens: string[]; traces: string[]; additives: string[] };
  classifications: { nutriScoreGrade: string | null; novaGroup: number | null; nutrientLevels: Record<string, string> | null; veganStatus: string | null; vegetarianStatus: string | null; palmOilStatus: string | null };
  categories: string[]; countriesSold: string[]; barcode: string | null; source: { label: string; completeness: string; confidenceScore: number; freshnessStatus: string; provider: string }; currentRevision: { revisionNumber: number } | null;
};
type Detail = { kind: "LOCAL" | "EXTERNAL"; food: FoodDetail };

const primary = [["caloriesKcal", "Calories", "kcal"], ["proteinGrams", "Protein", "g"], ["carbohydrateGrams", "Carbohydrates", "g"], ["fatGrams", "Fat", "g"]] as const;
const fullNutrition = [["sugarGrams", "Sugars", "g"], ["addedSugarGrams", "Added sugars", "g"], ["fiberGrams", "Fibre", "g"], ["saturatedFatGrams", "Saturated fat", "g"], ["transFatGrams", "Trans fat", "g"], ["sodiumMg", "Sodium", "mg"], ["saltGrams", "Salt", "g"], ["cholesterolMg", "Cholesterol", "mg"], ["potassiumMg", "Potassium", "mg"], ["calciumMg", "Calcium", "mg"], ["ironMg", "Iron", "mg"]] as const;

function format(value: number, maximumFractionDigits = 1) { return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value); }
function errorText(data: unknown) { if (!data || typeof data !== "object" || !("error" in data)) return undefined; const error = data.error; return typeof error === "string" ? error : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : undefined; }

export function FoodDetailsDialog({ food: preview, open, onOpenChange, onImported }: { food: SearchFood | null; open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [grams, setGrams] = useState(100);
  const detailCache = useRef(new Map<string, Detail>());

  const endpoint = preview?.isLocal && preview.id ? `/api/nutrition/foods/${preview.id}` : preview?.provider ? `/api/nutrition/foods/external/${preview.provider}/${encodeURIComponent(preview.externalId)}` : null;
  useEffect(() => {
    if (!open || !endpoint) return;
    let cancelled = false;
    const cached = detailCache.current.get(endpoint);
    if (cached) { setDetail(cached); setError(null); setLoading(false); return; }
    setLoading(true); setError(null); setDetail(null); setGrams(100);
    void fetch(endpoint).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(errorText(data) || "Unable to load complete food details.");
      if (!cancelled) { detailCache.current.set(endpoint, data); setDetail(data); }
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load complete food details."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, open]);

  const selectedNutrition = useMemo(() => detail ? calculateNutritionSnapshot(detail.food.nutritionPer100g, grams) : {}, [detail, grams]);
  const chooseServing = (nextGrams: number) => setGrams(nextGrams > 0 ? nextGrams : 100);
  async function importFood() {
    if (!preview?.provider) return;
    setImporting(true);
    try {
      const response = await fetch("/api/nutrition/foods/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: preview.provider, externalId: preview.externalId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(errorText(data) || "Unable to save this food.");
      toast.success(`${data.food.name} saved to Calistheni.`); onImported(); onOpenChange(false);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save this food."); } finally { setImporting(false); }
  }

  const food = detail?.food;
  // Provider image hosts are explicitly allowlisted in next.config.ts.
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex h-[min(90dvh,48rem)] max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"><DialogHeader className="shrink-0 border-b p-4 pr-12"><DialogTitle>{food?.name ?? preview?.name ?? "Food details"}</DialogTitle><DialogDescription>{food ? [food.brandName ?? "Generic food", food.package.quantityText].filter(Boolean).join(" · ") : "Loading food details"}</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto p-4">{loading ? <div className="space-y-4 animate-pulse"><div className="h-24 rounded-xl bg-muted" /><div className="h-20 rounded-xl bg-muted" /><div className="h-36 rounded-xl bg-muted" /></div> : error ? <div className="rounded-xl border border-destructive/30 p-4 text-sm"><p className="font-medium">Unable to load complete product details.</p><p className="mt-1 text-muted-foreground">{error}</p><Button className="mt-3" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div> : food ? <div className="space-y-5"><section className="flex gap-3"><div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">{food.images.front ? <Image src={food.images.front} alt={food.name} width={80} height={80} unoptimized className="size-full object-cover" /> : <Package className="text-muted-foreground" />}</div><div className="min-w-0"><p className="font-semibold">{food.brandName ?? "Generic food"}</p>{food.package.quantityText ? <p className="text-sm text-muted-foreground">Package: {food.package.quantityText}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{food.source.completeness.toLowerCase()} nutrition</p>{detail?.kind === "EXTERNAL" ? <p className="mt-1 text-xs text-muted-foreground">Not yet saved to Calistheni</p> : null}</div></section><section><h3 className="font-semibold">Nutrition</h3><p className="text-xs text-muted-foreground">Values for {format(grams)} g</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{primary.map(([key, label, unit]) => <div key={key} className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{selectedNutrition[key] === undefined ? "—" : `${format(selectedNutrition[key], key === "caloriesKcal" ? 0 : 1)} ${unit}`}</p></div>)}</div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={grams === 100 ? "default" : "outline"} onClick={() => chooseServing(100)}>100 g</Button>{food.servings.map((serving) => <Button key={serving.id} size="sm" variant={grams === serving.grams ? "default" : "outline"} onClick={() => chooseServing(serving.grams)}>{serving.name} ({format(serving.grams)} g)</Button>)}<Input aria-label="Custom grams" className="h-8 w-24" type="number" min="1" value={grams} onChange={(event) => chooseServing(Number(event.target.value))} /></div></section><section><h3 className="font-semibold">Full nutrition</h3><div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">{fullNutrition.filter(([key]) => food.nutritionPer100g[key] !== undefined).map(([key, label, unit]) => <p key={key} className="flex justify-between gap-2"><span>{label}</span><span className="font-medium">{format(selectedNutrition[key] ?? 0, 2)} {unit}</span></p>)}</div></section>{food.classifications.nutriScoreGrade || food.classifications.novaGroup || food.classifications.nutrientLevels ? <section><h3 className="font-semibold">Product classification</h3><div className="mt-2 flex flex-wrap gap-2 text-sm">{food.classifications.nutriScoreGrade ? <span className="rounded-full bg-muted px-3 py-1">Nutri-Score {food.classifications.nutriScoreGrade}</span> : null}{food.classifications.novaGroup ? <span className="rounded-full bg-muted px-3 py-1">NOVA {food.classifications.novaGroup}</span> : null}{Object.entries(food.classifications.nutrientLevels ?? {}).map(([name, level]) => <span key={name} className="rounded-full bg-muted px-3 py-1">{name}: {String(level)}</span>)}</div></section> : null}{food.ingredients.text ? <section><h3 className="font-semibold">Ingredients</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{food.ingredients.text}</p></section> : null}{food.ingredients.allergens.length || food.ingredients.traces.length ? <section><h3 className="font-semibold">Allergens</h3>{food.ingredients.allergens.length ? <p className="mt-1 text-sm">Contains: {food.ingredients.allergens.join(", ")}</p> : null}{food.ingredients.traces.length ? <p className="mt-1 text-sm">May contain traces of: {food.ingredients.traces.join(", ")}</p> : null}<p className="mt-2 text-xs text-muted-foreground">Allergen information is community-maintained; check the packaging when accuracy is important.</p></section> : null}{food.ingredients.additives.length ? <section><h3 className="font-semibold">Additives</h3><p className="mt-1 text-sm text-muted-foreground">{food.ingredients.additives.join(", ")}</p></section> : null}{food.categories.length || food.countriesSold.length || food.barcode ? <section><h3 className="font-semibold">Product details</h3>{food.barcode ? <p className="mt-1 text-sm">Barcode: {food.barcode}</p> : null}{food.categories.length ? <p className="mt-1 text-sm">Categories: {food.categories.slice(0, 8).join(", ")}</p> : null}{food.countriesSold.length ? <p className="mt-1 text-sm">Countries: {food.countriesSold.slice(0, 8).join(", ")}</p> : null}</section> : null}<section><h3 className="font-semibold">Food information</h3><p className="text-sm text-muted-foreground">{food.source.completeness.toLowerCase()} nutrition · {food.source.freshnessStatus.toLowerCase().replaceAll("_", " ")}</p>{food.source.provider === "OPEN_FOOD_FACTS" ? <p className="mt-2 text-xs text-muted-foreground">Product information is community-maintained. Check the packaging when accuracy is important.</p> : null}{food.currentRevision ? <p className="mt-1 text-xs text-muted-foreground">Revision {food.currentRevision.revisionNumber}</p> : null}</section></div> : null}</div>{detail?.kind === "EXTERNAL" ? <div className="shrink-0 border-t p-3"><Button className="w-full" disabled={importing} onClick={() => void importFood()}>{importing ? <Loader2 className="animate-spin" /> : null}Use food</Button></div> : null}</DialogContent></Dialog>;
}
