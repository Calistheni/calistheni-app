import assert from "node:assert/strict";
import test from "node:test";
import { formatDurationInput, parseDurationInput } from "@/lib/duration-input";

test("duration input parses canonical MM:SS and HH:MM:SS values", () => {
  assert.equal(parseDurationInput("00:45"), 45);
  assert.equal(parseDurationInput("15:30"), 930);
  assert.equal(parseDurationInput("01:05:20"), 3920);
  assert.equal(parseDurationInput("15:99"), null);
  assert.equal(formatDurationInput(45), "00:45");
  assert.equal(formatDurationInput(3920), "01:05:20");
});
