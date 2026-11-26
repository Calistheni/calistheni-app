import assert from "node:assert/strict";
import test from "node:test";
import {
  DISPLAY_NAME_LIMIT,
  prefillDisplayName,
  providerDisplayName,
  validateDisplayName,
} from "../lib/display-name.ts";

test("display names support multiword and international names, including mononyms", () => {
  assert.deepEqual(validateDisplayName("  Ana   María  ", " de la Cruz "), {
    ok: true,
    fields: { firstName: "Ana María", familyName: "de la Cruz" },
    name: "Ana María de la Cruz",
  });
  assert.deepEqual(validateDisplayName("王", ""), {
    ok: true,
    fields: { firstName: "王", familyName: "" },
    name: "王",
  });
});

test("display-name validation rejects blank given names, invalid inputs, and oversized names", () => {
  for (const [firstName, familyName] of [
    [" ", "Example"],
    [1, ""],
    ["Example", null],
    ["Name\nOther", ""],
    ["Name", "\u202Etest"],
    ["a".repeat(DISPLAY_NAME_LIMIT), "b"],
  ]) {
    assert.equal(validateDisplayName(firstName, familyName).ok, false);
  }
});

test("provider-supplied structured names prefill without guessing legacy name boundaries", () => {
  const structured = providerDisplayName("Ana María", "de la Cruz");
  assert.deepEqual(prefillDisplayName(structured), {
    firstName: "Ana María",
    familyName: "de la Cruz",
    legacyName: false,
  });
  const unstructured = providerDisplayName(undefined, undefined, "Kim Example Lee");
  assert.deepEqual(prefillDisplayName(unstructured), {
    firstName: "Kim Example Lee",
    familyName: "",
    legacyName: true,
  });
  const missing = providerDisplayName(undefined, undefined);
  assert.deepEqual(missing, { firstName: null, familyName: null, name: null });
  assert.deepEqual(prefillDisplayName(missing), { firstName: "", familyName: "", legacyName: false });
});
