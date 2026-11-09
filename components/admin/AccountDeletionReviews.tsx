"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type ReviewResource = {
  id: string | number;
  name?: string;
  title?: string | null;
  address?: string | null;
  lat?: number;
  lon?: number;
  photoUrl?: string | null;
  description?: string | null;
  brandName?: string | null;
  barcode?: string | null;
  submissionStatus?: string;
  contributionStatus?: string;
  parentFoodName?: string;
  aliases?: Array<{ name: string; languageCode: string | null }>;
  revisions?: Array<{ name: string; brandName: string | null; barcode: string | null; imageUrl: string | null; createdAt: string }>;
} | null;

type ReviewTask = {
  id: string;
  resourceKind: "PARK" | "FOOD" | "MEDIA";
  resourceType?: "FOOD" | "FOOD_REVISION" | "MEDIA_REVIEW";
  resourceId: string;
  status: "PENDING" | "RETRY";
  cleanupDeadline: string;
  attemptCount: number;
  lastErrorCategory: string | null;
  resource: ReviewResource;
};

type Monitoring = {
  pendingDeletions: number;
  activeCleanups: number;
  retryRequired: number;
  failedOperations: number;
  failedMediaCleanup: number;
  pendingAppleRevocations: number;
  failedAppleRevocations: number;
  oldestPendingDeletionAt: string | null;
  approachingDeadlines: number;
  overdueDeletions: number;
  outstandingReviewTasks: number;
};

type Payload = { tasks: ReviewTask[]; nextCursor: string | null; monitoring: Monitoring };
type ReviewAction = "KEEP_ANONYMIZED" | "REMOVE_FROM_PUBLIC";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

export function AccountDeletionReviews() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ task: ReviewTask; action: ReviewAction } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/account-deletion/review-tasks", { credentials: "include", cache: "no-store" });
      if (response.status === 401) throw new Error("Your administrator session has expired. Sign in again.");
      if (!response.ok) throw new Error("Unable to load deletion review tasks.");
      setPayload(await response.json() as Payload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load deletion review tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMore() {
    const cursor = payload?.nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/admin/account-deletion/review-tasks?cursor=${encodeURIComponent(cursor)}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load more review tasks.");
      const nextPage = await response.json() as Payload;
      setPayload((current) => current ? {
        ...nextPage,
        tasks: [...current.tasks, ...nextPage.tasks],
      } : nextPage);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load more review tasks.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  async function resolveSelected() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/account-deletion/review-tasks/${encodeURIComponent(selected.task.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selected.action }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "This task was already resolved by another administrator." : "Unable to resolve this review task.");
      toast.success(selected.action === "KEEP_ANONYMIZED" ? "Contribution kept after anonymization." : "Contribution removed from public visibility.");
      setSelected(null);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to resolve this review task.");
    } finally {
      setSaving(false);
    }
  }

  const metrics: Array<[string, number | undefined, "normal" | "warning"]> = [
    ["Pending deletions", payload?.monitoring.pendingDeletions, "normal"],
    ["Active cleanups", payload?.monitoring.activeCleanups, "normal"],
    ["Retry required", payload?.monitoring.retryRequired, "warning"],
    ["Failed operations", payload?.monitoring.failedOperations, "warning"],
    ["Media cleanup retries", payload?.monitoring.failedMediaCleanup, "warning"],
    ["Apple revocation pending", payload?.monitoring.pendingAppleRevocations, "warning"],
    ["Apple revocation retries", payload?.monitoring.failedAppleRevocations, "warning"],
    ["Deadlines within 7 days", payload?.monitoring.approachingDeadlines, "warning"],
    ["Overdue deletions", payload?.monitoring.overdueDeletions, "warning"],
    ["Outstanding review tasks", payload?.monitoring.outstandingReviewTasks, "normal"],
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl font-bold">Account deletion reviews</h1><p className="mt-1 text-sm text-muted-foreground">Review contributions that must be anonymized or removed before cleanup can complete. User identity is not shown.</p></div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh</Button>
      </div>

      {error ? <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive" role="alert">{error}</CardContent></Card> : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Deletion worker monitoring">
        {metrics.map(([label, value, tone]) => <Card key={label} className={tone === "warning" && value ? "border-amber-500/50" : ""}><CardContent className="p-4"><p className="min-h-10 text-xs leading-snug text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{loading && value === undefined ? "…" : (value ?? 0).toLocaleString()}</p></CardContent></Card>)}
      </section>
      {payload?.monitoring.oldestPendingDeletionAt ? <p className="text-sm text-muted-foreground">Oldest pending deletion request: {formatDate(payload.monitoring.oldestPendingDeletionAt)}</p> : null}

      <Card>
        <CardHeader><div className="flex items-center gap-2"><ShieldAlert className="size-5 text-amber-600" aria-hidden="true" /><h2 className="text-xl font-semibold">Pending community review</h2></div><p className="text-sm text-muted-foreground">Do not approve content unless it is safe to retain without identifying the deleted contributor.</p></CardHeader>
        <CardContent className="space-y-4">
          {loading && !payload ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading review tasks…</div> : null}
          {!loading && payload?.tasks.length === 0 ? <p className="text-sm text-muted-foreground">No contributions or media references are waiting for review.</p> : null}
          {payload?.tasks.map((task) => (
            <article key={task.id} className="space-y-4 rounded-lg border p-4" data-testid="deletion-review-task">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{task.resourceKind === "PARK" ? "Public park" : task.resourceKind === "MEDIA" ? "Park media" : task.resourceType === "FOOD_REVISION" ? "Food revision" : "Shared food"}</Badge><Badge variant={task.status === "RETRY" ? "destructive" : "outline"}>{task.status === "RETRY" ? "Retry required" : "Pending review"}</Badge></div>
                  {task.resource ? <>
                    <h3 className="break-words font-semibold">{task.resource.title || task.resource.name || "Contribution details unavailable"}</h3>
                    {task.resource.address ? <p className="break-words text-sm text-muted-foreground">{task.resource.address}</p> : null}
                    {typeof task.resource.lat === "number" && typeof task.resource.lon === "number" ? <p className="text-xs text-muted-foreground">Coordinates: {task.resource.lat.toFixed(5)}, {task.resource.lon.toFixed(5)}</p> : null}
                    {task.resource.description ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.resource.description}</p> : null}
                    {task.resource.brandName ? <p className="text-sm text-muted-foreground">Brand: {task.resource.brandName}</p> : null}
                    {task.resource.barcode ? <p className="text-xs text-muted-foreground">Barcode: {task.resource.barcode}</p> : null}
                    {task.resource.aliases?.length ? <p className="text-sm text-muted-foreground">Submitted aliases: {task.resource.aliases.map((alias) => alias.name).join(", ")}</p> : null}
                    {task.resource.revisions?.length ? <div className="space-y-1 text-xs text-muted-foreground"><p>Recent food revisions:</p>{task.resource.revisions.map((revision, index) => <p key={`${revision.createdAt}-${index}`}>{revision.name}{revision.brandName ? ` · ${revision.brandName}` : ""}{revision.barcode ? ` · ${revision.barcode}` : ""}</p>)}</div> : null}
                    {task.resourceType === "FOOD_REVISION" ? <p className="text-xs text-muted-foreground">Parent food: {task.resource.parentFoodName ?? "Unavailable"}</p> : null}
                    {task.resource.photoUrl ? <a className="inline-block text-sm underline underline-offset-4" href={task.resource.photoUrl} target="_blank" rel="noreferrer">Review contribution image</a> : null}
                  </> : <p className="text-sm text-muted-foreground">The contribution is no longer available; resolve this task as removed from public visibility.</p>}
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden="true" />Cleanup deadline: {formatDate(task.cleanupDeadline)}</p>
                  {task.lastErrorCategory ? <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="size-3.5" aria-hidden="true" />{task.lastErrorCategory}</p> : null}
                  <p className="text-xs text-muted-foreground">Review attempts: {task.attemptCount}</p>
                </div>
                {task.resourceType === "MEDIA_REVIEW" ? <p className="max-w-48 text-xs text-amber-700 dark:text-amber-400">The object is preserved. Resolve the underlying reference in the data, then retry cleanup.</p> : <div className="flex shrink-0 flex-col gap-2 sm:min-w-48">
                  <Button type="button" variant="outline" onClick={() => setSelected({ task, action: "KEEP_ANONYMIZED" })}><Check aria-hidden="true" />Keep anonymized</Button>
                  <Button type="button" variant="destructive" onClick={() => setSelected({ task, action: "REMOVE_FROM_PUBLIC" })}><Trash2 aria-hidden="true" />Remove from public</Button>
                </div>}
              </div>
            </article>
          ))}
          {payload?.nextCursor ? <div className="flex justify-center pt-2"><Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Load more review tasks</Button></div> : null}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => { if (!saving && !open) setSelected(null); }}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{selected?.action === "KEEP_ANONYMIZED" ? "Keep this contribution?" : "Remove this contribution from public view?"}</AlertDialogTitle>
            <AlertDialogDescription>{selected?.action === "KEEP_ANONYMIZED" ? "Confirm that you reviewed the contribution and it contains no identifying information after anonymization." : "The contribution will remain hidden from public discovery. This does not delete unrelated user data."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void resolveSelected(); }}>{saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Confirm review</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
