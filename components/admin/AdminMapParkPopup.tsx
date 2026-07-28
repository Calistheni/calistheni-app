"use client";

import Link from "next/link";
import { LoaderCircle, Pencil, QrCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ParkQrStatusBadge } from "@/components/admin/ParkQrStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminParkDetail, ParkQrStatus } from "@/types/park";

const QR_STATUSES: Array<{ value: ParkQrStatus; label: string }> = [
  { value: "NOT_INSTALLED", label: "No QR" },
  { value: "INSTALLED", label: "Installed" },
  { value: "NEEDS_REPLACEMENT", label: "Needs replacement" },
];

export function AdminMapParkPopup({
  park,
  onUpdated,
}: {
  park: AdminParkDetail;
  onUpdated: (park: AdminParkDetail) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [note, setNote] = useState(park.qrCodeNote ?? "");
  const archived = Boolean(park.deletedAt);

  async function save(status: ParkQrStatus, nextNote = note) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/parks/${park.id}/qr`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: nextNote }),
      });
      const payload = (await response.json()) as
        | AdminParkDetail
        | { error?: string };
      if (!response.ok || !("qrStatus" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to update QR status."
        );
      }
      setNote(payload.qrCodeNote ?? "");
      setIsEditingNote(false);
      onUpdated(payload);
      toast.success("QR deployment status updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update QR status."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={`w-64 space-y-3 ${archived ? "rounded-md border border-dashed border-muted-foreground/50 p-2" : ""}`}
    >
      {park.photoUrl ? (
        // Mapbox owns this popup DOM; a native image avoids a nested Next image loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={park.photoUrl}
          alt=""
          className="h-28 w-full rounded-md object-cover"
        />
      ) : null}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold leading-tight">{park.name}</h3>
          {archived ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {park.address ?? "Address unavailable"}
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">QR</span>
        <Select
          value={park.qrStatus}
          disabled={archived || isSaving}
          onValueChange={(value) => void save(value as ParkQrStatus)}
        >
          <SelectTrigger aria-label={`QR status for ${park.name}`} className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QR_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          {isSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : <QrCode className="size-3.5 text-primary" />}
          <ParkQrStatusBadge status={park.qrStatus} compact />
        </div>
      </div>

      {isEditingNote ? (
        <div className="space-y-2">
          <Textarea
            aria-label="QR deployment note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional deployment note"
            className="min-h-20 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setIsEditingNote(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save(park.qrStatus)} disabled={isSaving}>
              Save note
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1 text-xs"
          disabled={archived}
          onClick={() => setIsEditingNote(true)}
        >
          <Pencil className="size-3" aria-hidden="true" />
          {park.qrCodeNote ? "Edit note" : "Add note"}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        {park.equipment.length} equipment item{park.equipment.length === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin?park=${park.id}`}>Edit</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/parks/${park.id}`} target="_blank">Open detail</Link>
        </Button>
      </div>
    </div>
  );
}
