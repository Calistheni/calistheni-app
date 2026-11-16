import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { normalizeApplePrivateKey } from "../lib/auth/apple-private-key.ts";

function createP8Pem() {
  return generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
}

test("accepts a valid multiline Apple PKCS#8 P-256 private key", () => {
  const pem = createP8Pem();
  assert.equal(normalizeApplePrivateKey(pem), pem.trim());
});

test("normalizes escaped newlines in a valid Apple private key", () => {
  const pem = createP8Pem().trim();
  assert.equal(normalizeApplePrivateKey(pem.replaceAll("\n", "\\n")), pem);
  assert.equal(normalizeApplePrivateKey(pem.replaceAll("\n", "\\r\\n")), pem);
});

test("rejects quoted, base64-only, incomplete, and incompatible keys", () => {
  const pem = createP8Pem().trim();
  const payload = pem.split("\n").slice(1, -1).join("");
  const rsaPem = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
  const wrongCurvePem = generateKeyPairSync("ec", { namedCurve: "secp384r1" })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();

  for (const invalid of [
    `"${pem.replaceAll("\n", "\\n")}"`,
    payload,
    pem.replace("-----BEGIN PRIVATE KEY-----\n", ""),
    pem.slice(0, -20),
    rsaPem,
    wrongCurvePem,
  ]) {
    assert.throws(() => normalizeApplePrivateKey(invalid));
  }
});
