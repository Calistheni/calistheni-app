import type { ParkQrStatus } from "@/types/park";

export const MAX_PARK_QR_NOTE_LENGTH = 500;

export function normalizeParkQrNote(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const note = value.trim();
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
