"use client";

import { LoaderCircle, Pencil, QrCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ParkQrStatusBadge } from "@/components/admin/ParkQrStatusBadge";
import { isParkArchivedForAdminMap } from "@/lib/park-map-query";
import { PARK_QR_STATUS_OPTIONS } from "@/lib/park-qr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminParkDetail, ParkQrStatus } from "@/types/park";

function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ParkQrStatusControl({
  park,
  onUpdated,
}: {
  park: AdminParkDetail;
  onUpdated: (park: AdminParkDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ParkQrStatus>(park.qrStatus);
  const [note, setNote] = useState(park.qrCodeNote ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const isArchived = isParkArchivedForAdminMap(park);

  async function saveStatus() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/parks/${park.id}/qr`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const payload = (await response.json()) as
        | AdminParkDetail
        | { error?: string; code?: string };
      if (!response.ok || !("qrStatus" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to update QR status."
        );
      }

      onUpdated(payload);
      setStatus(payload.qrStatus);
      setNote(payload.qrCodeNote ?? "");
      setOpen(false);
      toast.success("QR deployment status updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update QR status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border p-4" aria-labelledby="park-qr-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" aria-hidden="true" />
            <h3 id="park-qr-title" className="font-semibold">
              QR sticker
            </h3>
          </div>
          <ParkQrStatusBadge status={park.qrStatus} />
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isArchived}>
              <Pencil aria-hidden="true" />
              Change status
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update QR sticker status</DialogTitle>
              <DialogDescription>
                Record the current physical sticker state for {park.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="park-qr-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as ParkQrStatus)}
                >
                  <SelectTrigger id="park-qr-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARK_QR_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="park-qr-note">Deployment note (optional)</Label>
                <Textarea
                  id="park-qr-note"
                  maxLength={500}
                  value={note}
                  placeholder="Sticker placed on the left side of the information board."
                  onChange={(event) => setNote(event.target.value)}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {note.length}/500
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={isSaving} onClick={saveStatus}>
                {isSaving ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : null}
                Save status
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {isArchived ? (
          <div className="sm:col-span-2 text-muted-foreground">
            QR deployment cannot be changed while this park is archived.
          </div>
        ) : null}
        {park.qrInstalledAt ? (
          <div>
            <dt className="text-muted-foreground">Installed</dt>
            <dd>{formatAdminDate(park.qrInstalledAt)}</dd>
          </div>
        ) : null}
        {park.qrInstalledByLabel ? (
          <div>
            <dt className="text-muted-foreground">Marked by</dt>
            <dd>{park.qrInstalledByLabel}</dd>
          </div>
        ) : null}
        {park.qrCodeNote ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Note</dt>
            <dd className="whitespace-pre-wrap">{park.qrCodeNote}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
