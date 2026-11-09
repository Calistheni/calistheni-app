import assert from "node:assert/strict";
import test from "node:test";
import { parseParkPhotoReference } from "@/lib/park-photo-object-key";

const publicUrl = "https://cdn.example.test/park-media";

test("resolves park photo keys from a configured CDN URL and equivalent relative key", () => {
  const key = "parks/user-1/photo.webp";
  assert.deepEqual(parseParkPhotoReference(`${publicUrl}/${key}`, publicUrl), { kind: "key", key });
  assert.deepEqual(parseParkPhotoReference(key, publicUrl), { kind: "key", key });
  assert.deepEqual(parseParkPhotoReference(`/park-media/${key}`, publicUrl), { kind: "key", key });
});

test("normalizes URL encoding and ignores query parameters and fragments", () => {
  const key = "parks/user-1/photo.webp";
  assert.deepEqual(parseParkPhotoReference(`${publicUrl}/parks/user-1/photo%2Ewebp?width=400&v=2#preview`, publicUrl), { kind: "key", key });
});

test("does not interpret arbitrary external URLs as R2-owned objects", () => {
  assert.deepEqual(parseParkPhotoReference("https://images.example.org/parks/user-1/photo.webp?cache=1", publicUrl), { kind: "external" });
});

test("malformed or unsafe URL paths fail closed", () => {
  assert.deepEqual(parseParkPhotoReference("https://[broken/parks/user-1/photo.webp", publicUrl), { kind: "invalid" });
  assert.deepEqual(parseParkPhotoReference(`${publicUrl}/parks/user-1/%2E%2E/photo.webp`, publicUrl), { kind: "invalid" });
});
