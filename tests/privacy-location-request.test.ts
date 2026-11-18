import assert from "node:assert/strict";
import test from "node:test";
import { parseNearbyParkCheckInput } from "@/lib/nearby-park-check-input";

test("nearby park check accepts JSON coordinates with the default radius", () => {
  assert.deepEqual(parseNearbyParkCheckInput({ lat: 42.6977, lon: 23.3219 }), {
    lat: 42.6977,
    lon: 23.3219,
    radiusMeters: 100,
  });
});

test("nearby park check rejects missing, string, non-finite, and out-of-range coordinates", () => {
  for (const value of [
    {},
    { lat: null, lon: 0 },
    { lat: "42.5", lon: "23.3" },
    { lat: Number.NaN, lon: 0 },
    { lat: 91, lon: 0 },
    { lat: 0, lon: 181 },
    { lat: 0, lon: 0, radius: 1_001 },
  ]) {
    assert.equal(parseNearbyParkCheckInput(value), null);
  }
});
