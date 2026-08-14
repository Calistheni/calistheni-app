import assert from "node:assert/strict";
import test from "node:test";
import { formatDurationInput, parseDurationInput } from "@/lib/duration-input";
import { durationSecondsFromDigits } from "@/components/workouts/DurationInput";

test("duration input parses canonical MM:SS and HH:MM:SS values", () => {
  assert.equal(parseDurationInput("00:45"), 45);
  assert.equal(parseDurationInput("15:30"), 930);
  assert.equal(parseDurationInput("01:05:20"), 3920);
  assert.equal(parseDurationInput("15:99"), null);
  assert.equal(formatDurationInput(45), "00:45");
  assert.equal(formatDurationInput(3920), "01:05:20");
});

test("duration mask keeps separators while accepting natural digit entry", () => {
  assert.equal(durationSecondsFromDigits("30"), 30);
  assert.equal(durationSecondsFromDigits("130"), 90);
  assert.equal(durationSecondsFromDigits("3000"), 1800);
  assert.equal(durationSecondsFromDigits("10530"), 3930);
});

test("duration input formatting keeps the human time structure after timer results", () => {
  assert.equal(formatDurationInput(62), "01:02");
  assert.equal(parseDurationInput("01:00"), 60);
  assert.equal(parseDurationInput("30:00"), 1800);
});
