const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_SUPPORTED_AGE = 120;

export function parseDateOfBirth(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function toValidDate(value: Date | string) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const dateOnly = parseDateOfBirth(value);
  if (dateOnly) return dateOnly;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateOfBirth(
  value: Date | null | undefined
): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;

  const year = value.getUTCFullYear().toString().padStart(4, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = value.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateOfBirthDisplay(value: string | null | undefined) {
  if (!value) return null;

  const date = parseDateOfBirth(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function getDateOfBirthRange(now: Date = new Date()) {
  const latest = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const earliest = new Date(
    Date.UTC(
      latest.getUTCFullYear() - MAX_SUPPORTED_AGE,
      latest.getUTCMonth(),
      latest.getUTCDate()
    )
  );

  return { earliest, latest };
}

export function calculateAge(
  dateOfBirth: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!dateOfBirth || Number.isNaN(now.getTime())) return null;

  const birthDate = toValidDate(dateOfBirth);
  if (!birthDate) return null;

  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasOccurred =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() &&
      now.getUTCDate() >= birthDate.getUTCDate());

  if (!birthdayHasOccurred) age -= 1;
  return age >= 0 ? age : null;
}

export type DateOfBirthValidationResult =
  | {
      success: true;
      date: Date | null;
      dateOnly: string | null;
      age: number | null;
    }
  | { success: false; error: string };

export function validateDateOfBirth(
  value: unknown,
  now: Date = new Date()
): DateOfBirthValidationResult {
  if (value === null || value === undefined || value === "") {
    return { success: true, date: null, dateOnly: null, age: null };
  }

  if (typeof value !== "string") {
    return { success: false, error: "Enter a valid date of birth." };
  }

  const dateOnly = value.trim();
  const date = parseDateOfBirth(dateOnly);
  if (!date) {
    return { success: false, error: "Enter a valid date of birth." };
  }

  const { earliest, latest: today } = getDateOfBirthRange(now);
  if (date.getTime() > today.getTime()) {
    return { success: false, error: "Date of birth cannot be in the future." };
  }

  const age = calculateAge(date, today);
  if (age === null) {
    return { success: false, error: "Enter a valid date of birth." };
  }
  if (date.getTime() < earliest.getTime() || age > MAX_SUPPORTED_AGE) {
    return {
      success: false,
      error: `Date of birth must represent an age of ${MAX_SUPPORTED_AGE} or younger.`,
    };
  }

  return { success: true, date, dateOnly, age };
}
