import { z } from "zod";

export const NOTE_MAX_LENGTH = 200;

/** Applies the same hard client-side boundary as the native textarea attribute. */
export function constrainNoteLength(value: string) {
  return value.slice(0, NOTE_MAX_LENGTH);
}

/** Trims only the edges of a saved note; internal whitespace and line breaks remain intact. */
export function normalizeOptionalNote(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/** Shared optional note contract for client payloads and all server mutations. */
export const optionalNoteSchema = z
  .union([z.string().max(NOTE_MAX_LENGTH, `Notes must be ${NOTE_MAX_LENGTH} characters or fewer.`), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? normalizeOptionalNote(value) : null));
