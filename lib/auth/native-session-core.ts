export const NATIVE_BEARER_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function parseNativeBearerHeader(value: string | null) {
  if (value === null) return { supplied: false as const, token: null };
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  return match
    ? { supplied: true as const, token: match[1] }
    : { supplied: true as const, token: null };
}

export function isNativeSessionUsable(
  session: { expiresAt: Date; revokedAt: Date | null },
  now = new Date()
) {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}
