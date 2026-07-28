import assert from "node:assert/strict";
import test from "node:test";
import {
  getParkQrUpdateData,
  normalizeParkQrNote,
} from "./park-qr.ts";

test("installing a QR records server time, actor, status time, and note", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  assert.deepEqual(
    getParkQrUpdateData({
      previousStatus: "NOT_INSTALLED",
      nextStatus: "INSTALLED",
      note: "Main information board",
      actorLabel: "Operations",
      now,
    }),
    {
      qrStatus: "INSTALLED",
      qrInstalledAt: now,
      qrInstalledByLabel: "Operations",
      qrStatusUpdatedAt: now,
      qrCodeNote: "Main information board",
    }
  );
});

test("editing an installed QR note preserves the original installer metadata", () => {
  const update = getParkQrUpdateData({
    previousStatus: "INSTALLED",
    nextStatus: "INSTALLED",
    note: "Updated placement note",
    actorLabel: "Another administrator",
    now: new Date("2026-07-29T12:00:00.000Z"),
  });

  assert.equal("qrInstalledAt" in update, false);
  assert.equal("qrInstalledByLabel" in update, false);
  assert.equal(update.qrCodeNote, "Updated placement note");
});

test("marking no QR clears current installation metadata", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const update = getParkQrUpdateData({
    nextStatus: "NOT_INSTALLED",
    note: null,
    actorLabel: "Operations",
    now,
  });

  assert.equal(update.qrInstalledAt, null);
  assert.equal(update.qrInstalledByLabel, null);
  assert.equal(update.qrStatusUpdatedAt, now);
});

test("replacement status preserves installation metadata", () => {
  const update = getParkQrUpdateData({
    nextStatus: "NEEDS_REPLACEMENT",
    note: "Sticker is damaged",
    actorLabel: "Operations",
    now: new Date("2026-07-28T12:00:00.000Z"),
  });

  assert.equal("qrInstalledAt" in update, false);
  assert.equal("qrInstalledByLabel" in update, false);
  assert.equal(update.qrCodeNote, "Sticker is damaged");
});

test("QR notes are optional, trimmed, and limited to 500 characters", () => {
  assert.equal(normalizeParkQrNote(undefined), null);
  assert.equal(normalizeParkQrNote("  Installed left of gate  "), "Installed left of gate");
  assert.equal(normalizeParkQrNote("x".repeat(500)), "x".repeat(500));
  assert.equal(normalizeParkQrNote("x".repeat(501)), undefined);
  assert.equal(normalizeParkQrNote(42), undefined);
});
