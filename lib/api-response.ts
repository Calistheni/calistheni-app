import { NextResponse } from "next/server";

export function createJsonErrorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export function createJsonValidationErrorResponse(
  error: string,
  fieldErrors: Record<string, string[] | undefined>
) {
  return NextResponse.json({ error, fieldErrors }, { status: 400 });
}

export function createInternalServerErrorResponse() {
  return createJsonErrorResponse("Internal server error.", 500);
}

export function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function isValidDateString(value: string) {
  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime());
}
