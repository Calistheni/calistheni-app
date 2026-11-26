export const DISPLAY_NAME_LIMIT = 120;

export type DisplayNameFields = { firstName: string; familyName: string };
export type DisplayNameErrors = Partial<Record<keyof DisplayNameFields, string>>;

const invalidNameCharacters = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

function cleanNamePart(value: unknown) {
  if (typeof value !== "string" || invalidNameCharacters.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length <= DISPLAY_NAME_LIMIT ? normalized : null;
}

export function formatDisplayName({ firstName, familyName }: DisplayNameFields) {
  return [firstName.trim(), familyName.trim()].filter(Boolean).join(" ");
}

export function validateDisplayName(first: unknown, family: unknown) {
  const firstName = cleanNamePart(first);
  const familyName = family === undefined ? "" : cleanNamePart(family);
  const errors: DisplayNameErrors = {};
  if (firstName === null) errors.firstName = "Enter a valid first name.";
  else if (!firstName) errors.firstName = "Enter your first name.";
  if (familyName === null) errors.familyName = "Enter a valid family name.";
  if (!firstName || familyName === null) return { ok: false as const, errors };

  const fields = { firstName, familyName };
  const name = formatDisplayName(fields);
  if (name.length > DISPLAY_NAME_LIMIT) {
    return { ok: false as const, errors: { familyName: `Use ${DISPLAY_NAME_LIMIT} characters or fewer for your full name.` } };
  }
  return { ok: true as const, fields, name };
}

/** Used only when creating an account from provider-supplied names. */
export function providerDisplayName(given: unknown, family: unknown, full?: unknown) {
  const firstName = cleanNamePart(given) || null;
  const familyName = cleanNamePart(family) || null;
  const name = formatDisplayName({ firstName: firstName ?? "", familyName: familyName ?? "" });
  if (name && name.length <= DISPLAY_NAME_LIMIT) return { firstName, familyName, name };
  return { firstName: null, familyName: null, name: cleanNamePart(full) || null };
}

export function prefillDisplayName(
  user: { name: string | null; firstName: string | null; familyName: string | null } | null
) {
  const legacyName = Boolean(user?.name && !user.firstName && !user.familyName);
  return {
    firstName: legacyName ? user?.name ?? "" : user?.firstName ?? "",
    familyName: user?.familyName ?? "",
    legacyName,
  };
}
