"use client";

import Link from "next/link";
import { Ban, Flag, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MODERATION_REPORT_REASONS, type ModerationReportReason, type ModerationReportTarget } from "@/lib/moderation-shared";

export function ModerationMenu({
  targetType,
  targetId,
  targetLabel,
  userId,
  afterBlockHref,
}: {
  targetType: ModerationReportTarget;
  targetId: string;
  targetLabel: string;
  userId?: string;
  afterBlockHref?: string;
}) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState<ModerationReportReason | "">("");
  const [explanation, setExplanation] = useState("");
  const [pending, setPending] = useState(false);

  async function submitReport() {
    if (!reason || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/moderation/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, explanation }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to submit report.");
      toast.success("Report submitted. Our moderation team will review it.");
      setReportOpen(false);
      setReason("");
      setExplanation("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setPending(false);
    }
  }

  async function blockUser() {
    if (!userId || pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/block`, { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to block user.");
      toast.success("User blocked. You will no longer see or receive interactions from them.");
      setBlockOpen(false);
      if (afterBlockHref) router.push(afterBlockHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to block user.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${targetLabel}`} onClick={(event) => event.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setReportOpen(true)}><Flag /> Report</DropdownMenuItem>
        {userId ? <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}><Ban /> Block user</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={reportOpen} onOpenChange={setReportOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report {targetLabel}</DialogTitle>
          <DialogDescription>Reports are confidential. The person you report will not see your identity. Read our <Link href="/community-guidelines">Community Guidelines</Link>.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`report-reason-${targetType}-${targetId}`}>Reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as ModerationReportReason)}>
              <SelectTrigger id={`report-reason-${targetType}-${targetId}`} className="w-full"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
              <SelectContent>{MODERATION_REPORT_REASONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`report-explanation-${targetType}-${targetId}`}>Additional details <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id={`report-explanation-${targetType}-${targetId}`} value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={1000} placeholder="Help moderators understand the issue." />
            <p className="text-right text-xs text-muted-foreground">{explanation.length}/1000</p>
          </div>
        </div>
        <DialogFooter showCloseButton>
          <Button type="button" onClick={() => void submitReport()} disabled={!reason || pending}>{pending ? "Submitting…" : "Submit report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Block this user?</AlertDialogTitle><AlertDialogDescription>Their content and interactions will be hidden from you. Existing follow relationships in both directions will be removed.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void blockUser()} disabled={pending}>{pending ? "Blocking…" : "Block user"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
