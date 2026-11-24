"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppShellUser } from "@/components/navigation/AppShellContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PARK_REPORT_REASONS } from "@/lib/moderation-shared";
import type { ParkSummary } from "@/types/park";

export function ParkReportSheet({ park, trigger, onClose }: {
  park: Pick<ParkSummary, "id" | "name">;
  trigger: HTMLButtonElement;
  onClose: () => void;
}) {
  const user = useAppShellUser();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const needsSignIn = !user || sessionExpired;

  function close() {
    if (!submitting.current) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (needsSignIn || !reason || submitting.current) return;

    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/moderation/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "PARK",
          targetId: String(park.id),
          reason,
          explanation,
        }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        return;
      }
      if (response.status === 409) {
        setError("You already reported this park.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "Unable to submit your report. Please try again.");
        return;
      }

      toast.success("Park report submitted for review.");
      onClose();
    } catch {
      setError("Unable to submit your report. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:mx-auto sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.isConnected) trigger.focus({ preventScroll: true });
        }}
      >
        <SheetHeader>
          <SheetTitle>Report park</SheetTitle>
          <SheetDescription>{park.name}</SheetDescription>
        </SheetHeader>
        {needsSignIn ? (
          <div className="space-y-3 px-4">
            <p className="text-sm text-muted-foreground">Sign in to send this park to the moderation team for review.</p>
            <SheetFooter className="px-0">
              <Button asChild>
                <Link href="/login?callbackUrl=%2Fparks" onClick={close}>Sign in</Link>
              </Button>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            </SheetFooter>
          </div>
        ) : (
          <form className="space-y-4 px-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="park-report-reason">Reason</Label>
              <select
                id="park-report-reason"
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-base"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                disabled={pending}
              >
                <option value="" disabled>Choose a reason</option>
                {PARK_REPORT_REASONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="park-report-details">Details (optional)</Label>
              <Textarea
                id="park-report-details"
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                maxLength={1000}
                disabled={pending}
              />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <SheetFooter className="px-0">
              <Button type="submit" disabled={!reason || pending}>{pending ? "Submitting…" : "Submit report"}</Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={close}>Cancel</Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
