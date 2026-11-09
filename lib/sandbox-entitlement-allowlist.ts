/** Exact canonical IDs only; never accept emails or request-controlled flags. */
export function isCanonicalUserIdAllowlisted(userId: string, configured?: string) {
  if (!configured) return false;
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(userId);
}
