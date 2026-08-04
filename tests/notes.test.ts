import assert from "node:assert/strict";
import test from "node:test";
import { constrainNoteLength, NOTE_MAX_LENGTH, normalizeOptionalNote, optionalNoteSchema } from "../lib/notes.ts";
import { EXERCISE_NOTE_MAX_HEIGHT, EXERCISE_NOTE_MIN_HEIGHT, getAutoResizeNoteState } from "../components/ui/note-textarea.tsx";
import { measurementSchema } from "../lib/progress.ts";
import { normalizeParkQrNote } from "../lib/park-qr.ts";

test("optional notes trim only their edges and preserve internal spaces and line breaks", () => {
  const note = "  Strong session\nwith  extra spaces inside.  ";
  assert.equal(NOTE_MAX_LENGTH, 200);
  assert.equal(normalizeOptionalNote(note), "Strong session\nwith  extra spaces inside.");
  assert.equal(normalizeOptionalNote(" \n\t "), null);
  assert.equal(optionalNoteSchema.parse(note), "Strong session\nwith  extra spaces inside.");
});

test("the shared note limit permits 199 and 200 characters but rejects 201 server-side", () => {
  assert.equal(optionalNoteSchema.safeParse("x".repeat(NOTE_MAX_LENGTH - 1)).success, true);
  assert.equal(optionalNoteSchema.safeParse("x".repeat(NOTE_MAX_LENGTH)).success, true);
  assert.equal(optionalNoteSchema.safeParse("x".repeat(NOTE_MAX_LENGTH + 1)).success, false);
  assert.equal(optionalNoteSchema.safeParse(12).success, false);
});

test("the shared client boundary truncates typing, paste, drop, and autofill-sized values at 200", () => {
  const oversized = "x".repeat(NOTE_MAX_LENGTH + 37);
  assert.equal(constrainNoteLength("x".repeat(NOTE_MAX_LENGTH - 1)).length, NOTE_MAX_LENGTH - 1);
  assert.equal(constrainNoteLength("x".repeat(NOTE_MAX_LENGTH)).length, NOTE_MAX_LENGTH);
  assert.equal(constrainNoteLength(oversized).length, NOTE_MAX_LENGTH);
});

test("measurement and park note validation use the shared 200-character contract", () => {
  const measurement = measurementSchema.parse({
    measuredAt: new Date(),
    bodyweightKg: 80,
    note: "  Morning check-in\nwith a clear plan.  ",
  });
  assert.equal(measurement.note, "Morning check-in\nwith a clear plan.");
  assert.equal(normalizeParkQrNote("  Sticker placed\non the board.  "), "Sticker placed\non the board.");
  assert.equal(normalizeParkQrNote("x".repeat(NOTE_MAX_LENGTH + 1)), undefined);
  assert.equal(measurementSchema.safeParse({ measuredAt: new Date(), bodyweightKg: 80, note: "x".repeat(NOTE_MAX_LENGTH + 1) }).success, false);
});

test("editable note UIs preserve raw typing and use the shared counter control", async () => {
  const fs = await import("node:fs/promises");
  const [workouts, routines, measurements, parkQr] = await Promise.all([
    fs.readFile(new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../components/routines/RoutineBuilder.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../components/profile/MeasurementTracker.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../components/admin/ParkQrStatusControl.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [workouts, routines, measurements, parkQr]) assert.match(source, /NoteTextarea/);
  assert.match(workouts, /ExerciseNoteTextarea/);
  assert.match(routines, /ExerciseNoteTextarea/);
  assert.match(workouts, /notes: value/);
  assert.match(routines, /notes: event\.target\.value/);
  assert.match(workouts, /normalizeOptionalNote\(notes\)/);
  assert.match(measurements, /normalizeOptionalNote\(note\)/);
});

test("exercise notes start compact, grow with content, and scroll only after their cap", () => {
  assert.deepEqual(getAutoResizeNoteState(20), { height: EXERCISE_NOTE_MIN_HEIGHT, overflowY: "hidden" });
  assert.deepEqual(getAutoResizeNoteState(84), { height: 84, overflowY: "hidden" });
  assert.deepEqual(getAutoResizeNoteState(EXERCISE_NOTE_MAX_HEIGHT + 24), { height: EXERCISE_NOTE_MAX_HEIGHT, overflowY: "auto" });
});

test("exercise note textarea disables manual resizing and keeps its accessible character counter", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/ui/note-textarea.tsx", import.meta.url), "utf8"));
  assert.match(source, /useLayoutEffect/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /rows=\{1\}/);
  assert.match(source, /EXERCISE_NOTE_MIN_HEIGHT = 38/);
  assert.match(source, /textarea\.style\.height = `\$\{EXERCISE_NOTE_MIN_HEIGHT\}px`/);
  assert.match(source, /!min-h-\[38px\]/);
  assert.doesNotMatch(source, /min-h-20/);
  assert.match(source, /space-y-1/);
  assert.match(source, /resize-none/);
  assert.match(source, /resize: "none"/);
  assert.match(source, /break-words/);
  assert.match(source, /aria-describedby/);
  assert.match(source, /NOTE_MAX_LENGTH/);
  assert.match(source, /constrainNoteLength/);
  assert.match(source, /onChange=\{constrainedChange\(onChange\)\}/);
});
