"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { getAdminModerationReports } from "@/lib/moderation-admin";
import { PARK_REPORT_REASONS } from "@/lib/moderation-shared";

type Report = Awaited<ReturnType<typeof getAdminModerationReports>>[number];

export function ModerationQueue({ initialReports }: { initialReports: Report[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function act(report: Report, action: string) {
    if (pending) return;
    setPending(report.id);
    try {
      const response = await fetch(`/api/admin/moderation/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[report.id] ?? "" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to apply moderation action.");
      toast.success("Moderation action recorded.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to apply moderation action.");
    } finally {
      setPending(null);
    }
  }

  if (!initialReports.length) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">No moderation reports.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {initialReports.map((report) => (
        <Card key={report.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{report.targetLabel}</h2>
                <p className="text-xs text-muted-foreground">
                  {report.targetType.toLowerCase().replaceAll("_", " ")} · submitted {new Date(report.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{report.status.toLowerCase().replaceAll("_", " ")}</Badge>
                <Badge>{(report.targetType === "PARK" ? PARK_REPORT_REASONS.find(({ value }) => value === report.reason)?.label : null) ?? report.reason.toLowerCase().replaceAll("_", " ")}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.targetType === "PARK" ? (
              <p className="break-all text-sm">
                {report.reporterId ? (
                  <>Reporter <Link className="underline" href={`/admin/users/${report.reporterId}`}>{report.reporterId}</Link></>
                ) : "Reporter unavailable"}
              </p>
            ) : null}
            {report.targetExcerpt ? <blockquote className="rounded-lg border-l-4 bg-muted/40 p-3 text-sm">{report.targetExcerpt}</blockquote> : null}
            {report.explanation ? <div><p className="text-xs font-medium text-muted-foreground">Reporter context</p><p className="text-sm">{report.explanation}</p></div> : null}
            <div className="flex flex-wrap gap-2">
              {report.targetType === "WORKOUT" ? <Button asChild size="sm" variant="outline"><Link href={`/workouts/${report.targetId}`}>Inspect workout</Link></Button> : null}
              {report.targetType === "PARK" && /^\d+$/.test(report.targetId) ? <Button asChild size="sm" variant="outline"><Link href={`/admin?park=${report.targetId}`}>Inspect park #{report.targetId}</Link></Button> : null}
              {report.targetOwnerId ? <Button asChild size="sm" variant="outline"><Link href={`/admin/users/${report.targetOwnerId}`}>Inspect account</Link></Button> : null}
            </div>
            {report.actions.length ? (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Action history</p>
                {report.actions.map((action) => (
                  <p key={action.id} className="mt-1 text-xs">
                    {action.action.toLowerCase().replaceAll("_", " ")} · {action.actorLabel} · {new Date(action.createdAt).toLocaleString()}{action.note ? ` · ${action.note}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            <Textarea
              value={notes[report.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
              maxLength={1000}
              placeholder="Internal moderation note (optional)"
            />
            <div className="flex flex-wrap gap-2">
              {report.targetType !== "USER" ? (
                <>
                  <Button variant="destructive" disabled={pending === report.id} onClick={() => void act(report, "HIDE_CONTENT")}>Hide content</Button>
                  <Button variant="outline" disabled={pending === report.id} onClick={() => void act(report, "RESTORE_CONTENT")}>Restore content</Button>
                </>
              ) : null}
              {report.targetOwnerId ? (
                <>
                  <Button variant="destructive" disabled={pending === report.id} onClick={() => void act(report, "RESTRICT_USER")}>Restrict account</Button>
                  <Button variant="outline" disabled={pending === report.id} onClick={() => void act(report, "UNRESTRICT_USER")}>Restore account</Button>
                </>
              ) : null}
              <Button variant="outline" disabled={pending === report.id} onClick={() => void act(report, "RESOLVE_REPORT")}>Resolve without removal</Button>
              <Button variant="ghost" disabled={pending === report.id} onClick={() => void act(report, "DISMISS_REPORT")}>Dismiss</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {report.targetType === "PARK" ? "Reporter identity is visible to admins. " : "Reporter identity is intentionally not displayed. "}
              All moderator actions are recorded with the authenticated admin label.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
