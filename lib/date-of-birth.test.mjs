import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAge,
  formatDateOfBirth,
  formatDateOfBirthDisplay,
  getDateOfBirthRange,
  validateDateOfBirth,
} from "./date-of-birth.ts";

const NOW = new Date("2026-07-22T12:00:00.000Z");

test("calculates completed years before and on a birthday", () => {
  assert.equal(calculateAge("2000-07-23", NOW), 25);
  assert.equal(calculateAge("2000-07-22", NOW), 26);
});

test("rejects impossible and future calendar dates", () => {
  assert.deepEqual(validateDateOfBirth("2026-02-30", NOW), {
    success: false,
    error: "Enter a valid date of birth.",
  });
  assert.deepEqual(validateDateOfBirth("2026-07-23", NOW), {
    success: false,
    error: "Date of birth cannot be in the future.",
  });
});

test("rejects dates representing an age over 120", () => {
  const result = validateDateOfBirth("1905-07-22", NOW);
  assert.equal(result.success, false);
});

test("uses the same exact 120-year range as the calendar", () => {
  const range = getDateOfBirthRange(NOW);
  assert.equal(formatDateOfBirth(range.earliest), "1906-07-22");
  assert.equal(formatDateOfBirth(range.latest), "2026-07-22");
  assert.equal(validateDateOfBirth("1906-07-22", NOW).success, true);
  assert.equal(validateDateOfBirth("1906-07-21", NOW).success, false);
});

test("accepts empty values for backward compatibility", () => {
  assert.deepEqual(validateDateOfBirth(null, NOW), {
    success: true,
    date: null,
    dateOnly: null,
    age: null,
  });
});

test("round trips the selected calendar day through UTC storage", () => {
  const result = validateDateOfBirth("2004-05-17", NOW);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.date.toISOString(), "2004-05-17T00:00:00.000Z");
  assert.equal(formatDateOfBirth(result.date), "2004-05-17");
  assert.equal(formatDateOfBirthDisplay("2004-05-17"), "17 May 2004");
});
