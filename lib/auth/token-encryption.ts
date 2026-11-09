import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function decodeEncryptionKey(encoded: string, label: string) {
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error(`${label} must be 32 base64url-encoded bytes.`);
  return key;
}

type TokenEncryptionEnvironment = Record<string, string | undefined>;

function encryptionKeyring(environment: TokenEncryptionEnvironment = process.env) {
  const activeKeyId = environment.AUTH_TOKEN_ENCRYPTION_ACTIVE_KEY_ID?.trim();
  const encodedKeyring = environment.AUTH_TOKEN_ENCRYPTION_KEYS?.trim();
  const legacy = environment.AUTH_TOKEN_ENCRYPTION_KEY?.trim();
  const keys = new Map<string, Buffer>();
  if (encodedKeyring) {
    let parsed: unknown;
    try { parsed = JSON.parse(encodedKeyring); } catch {
      throw new Error("AUTH_TOKEN_ENCRYPTION_KEYS must be a JSON object.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("AUTH_TOKEN_ENCRYPTION_KEYS must be a JSON object.");
    }
    for (const [keyId, encoded] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId) || typeof encoded !== "string") {
        throw new Error("AUTH_TOKEN_ENCRYPTION_KEYS contains an invalid key entry.");
      }
      keys.set(keyId, decodeEncryptionKey(encoded, `Encryption key ${keyId}`));
    }
  }
  if (activeKeyId && !keys.has(activeKeyId)) {
    throw new Error("AUTH_TOKEN_ENCRYPTION_ACTIVE_KEY_ID is not present in AUTH_TOKEN_ENCRYPTION_KEYS.");
  }
  if (!activeKeyId && keys.size > 0) {
    throw new Error("AUTH_TOKEN_ENCRYPTION_ACTIVE_KEY_ID is required with AUTH_TOKEN_ENCRYPTION_KEYS.");
  }
  if (!activeKeyId && !legacy) throw new Error("Authentication token encryption is not configured.");
  return {
    activeKeyId: activeKeyId ?? "legacy",
    keys,
    legacyKey: legacy ? decodeEncryptionKey(legacy, "AUTH_TOKEN_ENCRYPTION_KEY") : null,
  };
}

export type EncryptedAuthToken = { ciphertext: string; iv: string; tag: string; keyId: string };

export function encryptAuthToken(value: string, environment: TokenEncryptionEnvironment = process.env): EncryptedAuthToken {
  const keyring = encryptionKeyring(environment);
  const key = keyring.keys.get(keyring.activeKeyId) ?? keyring.legacyKey;
  if (!key) throw new Error("The active authentication encryption key is unavailable.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    keyId: keyring.activeKeyId,
  };
}

export function decryptAuthToken(
  value: Omit<EncryptedAuthToken, "keyId"> & { keyId?: string | null },
  environment: TokenEncryptionEnvironment = process.env
) {
  const keyring = encryptionKeyring(environment);
  const key = value.keyId
    ? value.keyId === "legacy" ? keyring.legacyKey : keyring.keys.get(value.keyId)
    : keyring.legacyKey;
  if (!key) throw new Error("The authentication token encryption key is unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
