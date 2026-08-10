"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ContributionStatus = "PENDING" | "APPROVED" | "REJECTED";
type ContributionFilter = "ALL" | ContributionStatus;

export type FoodContribution = {
  id: string;
  name: string;
  status: ContributionStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByAdminLabel: string | null;
  rejectionReason: string | null;
  confidenceScore: string | number;
  nutritionBasisGrams: string | number;
  caloriesKcal: string | number | null;
  proteinGrams: string | number | null;
  carbohydrateGrams: string | number | null;
  fatGrams: string | number | null;
  aliases: { name: string }[];
  servings: { name: string; grams: string | number }[];
  createdByUser: { id: string; name: string | null; email: string | null } | null;
  submittedAt: string;
  submittedProposal: Record<string, unknown> | null;
  submittedNutrition: {
    nutritionBasisGrams: number;
    caloriesKcal: string | null;
    proteinGrams: string | null;
    carbohydrateGrams: string | null;
    fatGrams: string | null;
  };
  approvedFood: { id: string; name: string } | null;
  mergedIntoFood: { id: string; name: string } | null;
};

type HistoryResponse = {
  foods: FoodContribution[];
  counts: Record<ContributionStatus, number>;
  nextCursor: string | null;
};

const filters: { value: ContributionFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const emptyMessage: Record<ContributionFilter, string> = {
  ALL: "No food contributions yet.",
  PENDING: "No pending food contributions.",
  APPROVED: "No approved food contributions yet.",
  REJECTED: "No rejected food contributions yet.",
};

function formatDate(value: string | null) {
  if (!value) return "Not reviewed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusVariant(status: ContributionStatus) {
  if (status === "APPROVED") return "default" as const;
  if (status === "REJECTED") return "destructive" as const;
  return "secondary" as const;
}

function contributorLabel(food: FoodContribution) {
  return food.createdByUser?.name ?? food.createdByUser?.email ?? "Unknown user";
}

export function NutritionContributionsAdmin({ initialHistory }: { initialHistory: HistoryResponse }) {
  const [filter, setFilter] = useState<ContributionFilter>("PENDING");
  const [history, setHistory] = useState(initialHistory);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<FoodContribution | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  async function load(nextFilter: ContributionFilter, cursor?: string, append = false) {
    setLoading(true);
    try {
      const query = new URLSearchParams({ status: nextFilter, limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/admin/nutrition/foods?${query}`);
      const payload = (await response.json().catch(() => null)) as HistoryResponse | { error?: string } | null;
      if (!response.ok || !payload || !("foods" in payload)) {
        throw new Error((payload && "error" in payload && payload.error) || "Unable to load food contributions.");
      }
      setHistory((current) => append ? { ...payload, foods: [...current.foods, ...payload.foods] } : payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load food contributions.");
    } finally {
      setLoading(false);
    }
  }

  function changeFilter(nextFilter: string) {
    const typedFilter = nextFilter as ContributionFilter;
    setFilter(typedFilter);
    void load(typedFilter);
  }

  async function moderate(food: FoodContribution, action: "approve" | "reject", reason?: string) {
    setBusy(food.id);
    try {
      const response = await fetch(`/api/admin/nutrition/foods/${food.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(reason?.trim() ? { rejectionReason: reason.trim() } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to update this contribution.");
      if (action === "reject") {
        setRejecting(null);
        setRejectionReason("");
      }
      await load(filter);
      toast.success(action === "approve" ? "Food approved and now public." : "Contribution rejected and retained in history.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update this contribution.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="space-y-4">
    <Tabs value={filter} onValueChange={changeFilter}>
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1">
        {filters.map((item) => <TabsTrigger key={item.value} value={item.value} className="gap-1.5 px-1.5 py-2 text-xs sm:text-sm">
          {item.label}{item.value !== "ALL" ? <Badge variant="outline" className="h-4 px-1 text-[10px]">{history.counts[item.value]}</Badge> : null}
        </TabsTrigger>)}
      </TabsList>
    </Tabs>

    {loading && !history.foods.length ? <Card><CardContent className="p-5 text-sm text-muted-foreground">Loading food contributions…</CardContent></Card> : null}
    {!loading && !history.foods.length ? <Card><CardContent className="p-5 text-sm text-muted-foreground">{emptyMessage[filter]}</CardContent></Card> : null}
    {history.foods.map((food) => <Card key={food.id}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{food.name}</p>
          <p className="text-sm text-muted-foreground">Submitted by {contributorLabel(food)}</p>
          {food.createdByUser?.email ? <p className="text-xs text-muted-foreground">{food.createdByUser.email}</p> : null}
        </div>
        <Badge variant={statusVariant(food.status)}>{food.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submitted</p><p>{formatDate(food.submittedAt)}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reviewed</p><p>{food.reviewedByAdminLabel ? `${food.reviewedByAdminLabel} · ${formatDate(food.reviewedAt)}` : "Awaiting moderation"}</p></div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Original submitted nutrition · per {food.submittedNutrition.nutritionBasisGrams} g</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4"><span>{food.submittedNutrition.caloriesKcal ?? "—"} kcal</span><span>P {food.submittedNutrition.proteinGrams ?? "—"} g</span><span>C {food.submittedNutrition.carbohydrateGrams ?? "—"} g</span><span>F {food.submittedNutrition.fatGrams ?? "—"} g</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Aliases: {food.aliases.map((alias) => alias.name).join(", ") || "None"} · Serving: {food.servings.map((serving) => `${serving.name} ${serving.grams} g`).join(", ") || "None"}</p>
        {food.approvedFood ? <p className="text-sm text-muted-foreground">Created food: <span className="font-medium text-foreground">{food.approvedFood.name}</span></p> : null}
        {food.mergedIntoFood ? <p className="text-sm text-muted-foreground">Merged into: <span className="font-medium text-foreground">{food.mergedIntoFood.name}</span></p> : null}
        {food.status === "REJECTED" ? <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm"><span className="font-medium">Reason: </span>{food.rejectionReason || "No reason provided."}</p> : null}
        {food.status === "PENDING" ? <div className="flex flex-wrap gap-2"><Button disabled={busy === food.id} onClick={() => void moderate(food, "approve")}>Approve</Button><Button disabled={busy === food.id} variant="destructive" onClick={() => { setRejecting(food); setRejectionReason(""); }}>Reject</Button></div> : null}
      </CardContent>
    </Card>)}
    {history.nextCursor ? <Button variant="outline" disabled={loading} onClick={() => void load(filter, history.nextCursor ?? undefined, true)}>{loading ? "Loading…" : "Load more"}</Button> : null}

    <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open && !busy) setRejecting(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject contribution</DialogTitle><DialogDescription>Optionally leave an explanation for the moderation history.</DialogDescription></DialogHeader>
        <div className="space-y-2"><Label htmlFor="food-contribution-reason">Reason</Label><Textarea id="food-contribution-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Nutrition data could not be verified." /></div>
        <DialogFooter><Button variant="outline" disabled={Boolean(busy)} onClick={() => setRejecting(null)}>Cancel</Button><Button variant="destructive" disabled={!rejecting || Boolean(busy)} onClick={() => rejecting && void moderate(rejecting, "reject", rejectionReason)}>{busy ? "Rejecting…" : "Reject contribution"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
