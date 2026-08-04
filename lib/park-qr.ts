import type { ParkQrStatus } from "@/types/park";
import { NOTE_MAX_LENGTH, normalizeOptionalNote } from "./notes.ts";

export const MAX_PARK_QR_NOTE_LENGTH = NOTE_MAX_LENGTH;
export const PARK_QR_STATUS_OPTIONS: Array<{
  value: ParkQrStatus;
  label: string;
}> = [
  { value: "NOT_INSTALLED", label: "No QR" },
  { value: "INSTALLED", label: "Installed" },
  { value: "NEEDS_REPLACEMENT", label: "Needs replacement" },
];

export function normalizeParkQrNote(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const note = normalizeOptionalNote(value);
  if (!note) return null;
  return note.length <= MAX_PARK_QR_NOTE_LENGTH ? note : undefined;
}

export function getParkQrUpdateData({
  previousStatus,
  nextStatus,
  note,
  actorLabel,
  now,
}: {
  previousStatus?: ParkQrStatus;
  nextStatus: ParkQrStatus;
  note: string | null;
  actorLabel: string;
  now: Date;
}) {
  if (nextStatus === "INSTALLED") {
    if (previousStatus === "INSTALLED") {
      return {
        qrStatus: nextStatus,
        qrStatusUpdatedAt: now,
        qrCodeNote: note,
      };
    }
    return {
      qrStatus: nextStatus,
      qrInstalledAt: now,
      qrInstalledByLabel: actorLabel,
      qrStatusUpdatedAt: now,
      qrCodeNote: note,
    };
  }

  if (nextStatus === "NOT_INSTALLED") {
    return {
      qrStatus: nextStatus,
      qrInstalledAt: null,
      qrInstalledByLabel: null,
      qrStatusUpdatedAt: now,
      qrCodeNote: note,
    };
  }

  return {
    qrStatus: nextStatus,
    qrStatusUpdatedAt: now,
    qrCodeNote: note,
  };
}
