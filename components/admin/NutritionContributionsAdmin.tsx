"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export type PendingContribution = { id: string; name: string; createdAt: string; confidenceScore: string | number; nutritionBasisGrams: string | number; caloriesKcal: string | number | null; proteinGrams: string | number | null; carbohydrateGrams: string | number | null; fatGrams: string | number | null; aliases: { name: string }[]; servings: { name: string; grams: string | number }[]; createdByUser: { name: string | null; email: string | null } | null; sourceRecords: { rawData: unknown }[] };

export function NutritionContributionsAdmin({ initialFoods }: { initialFoods: PendingContribution[] }) {
  const [foods, setFoods] = useState(initialFoods);
  const [busy, setBusy] = useState<string | null>(null);
  async function moderate(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const response = await fetch(`/api/admin/nutrition/foods/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error("Unable to update this contribution.");
      setFoods((current) => current.filter((food) => food.id !== id));
      toast.success(action === "approve" ? "Food approved and now public." : "Contribution rejected.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update this contribution."); }
    finally { setBusy(null); }
  }
  return <div className="space-y-4">{foods.length ? foods.map((food) => <Card key={food.id}><CardHeader className="flex-row items-start justify-between gap-3"><div><p className="font-semibold">{food.name}</p><p className="text-sm text-muted-foreground">{food.createdByUser?.name ?? food.createdByUser?.email ?? "Unknown contributor"} · {new Date(food.createdAt).toLocaleDateString()}</p></div><Badge>AI-assisted · Pending</Badge></CardHeader><CardContent className="space-y-3"><p className="text-sm">Per 100 g · {food.caloriesKcal ?? "—"} kcal · P {food.proteinGrams ?? "—"} · C {food.carbohydrateGrams ?? "—"} · F {food.fatGrams ?? "—"}</p><p className="text-xs text-muted-foreground">Aliases: {food.aliases.map((alias) => alias.name).join(", ") || "None"} · Serving: {food.servings.map((serving) => `${serving.name} ${serving.grams} g`).join(", ") || "None"}</p><div className="flex gap-2"><Button disabled={busy === food.id} onClick={() => void moderate(food.id, "approve")}>Approve</Button><Button disabled={busy === food.id} variant="destructive" onClick={() => void moderate(food.id, "reject")}>Reject</Button></div></CardContent></Card>) : <Card><CardContent className="p-5 text-sm text-muted-foreground">No pending food contributions.</CardContent></Card>}</div>;
}
