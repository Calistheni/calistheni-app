import { createPrivateKey } from "node:crypto";

const PKCS8_BEGIN = "-----BEGIN PRIVATE KEY-----";
const PKCS8_END = "-----END PRIVATE KEY-----";

/**
 * Normalize transport-safe newlines and validate an Apple Sign in with Apple
 * .p8 key without accepting a different key format or algorithm.
 */
export function normalizeApplePrivateKey(value: string) {
  const normalized = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
  const lines = normalized.split("\n");

  if (
    lines.length < 3 ||
    lines[0] !== PKCS8_BEGIN ||
    lines.at(-1) !== PKCS8_END ||
    lines.slice(1, -1).some((line) => !/^[A-Za-z0-9+/]+={0,2}$/.test(line))
  ) {
    throw new Error("Invalid Apple private key format");
  }

  const key = createPrivateKey(normalized);
  if (
    key.type !== "private" ||
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("Invalid Apple private key algorithm");
  }

  return normalized;
}
