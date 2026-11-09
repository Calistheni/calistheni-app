import { hash, verify } from "@node-rs/argon2";

const PASSWORD_OPTIONS = {
  // @node-rs/argon2's documented Argon2id discriminator is 2. Its ambient
  // const enum cannot be referenced under isolatedModules.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$08qT9PyqvE0DVevS7xkwIQ$pyOEbq9fdIjsIfFhFfJNVI1kjpulpf4wi0WQGMlj8Mw";

export function normalizeAuthEmail(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function validatePassword(value: string) {
  if (value.length < 12) return "Use at least 12 characters.";
  if (value.length > 1024) return "Password is too long.";
  return null;
}

export function hashPassword(password: string) {
  return hash(password, PASSWORD_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try { return await verify(passwordHash, password); } catch { return false; }
}
