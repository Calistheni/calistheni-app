import { NextResponse } from "next/server";
import { createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { barcodeContributionSchema, saveBarcodeContribution } from "@/lib/nutrition/barcode-contribution";
import { getAuthenticatedUserId, createUserUnauthorizedResponse } from "@/lib/user-auth";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const parsed = barcodeContributionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return createJsonValidationErrorResponse("Enter valid product information.", parsed.error.flatten().fieldErrors);
  const saved = await saveBarcodeContribution(userId, parsed.data);
  if (saved.kind === "raced") return createJsonErrorResponse("We found this product while you were adding it. Look it up again to use the existing product.", 409, "BARCODE_EXISTS");
  return NextResponse.json(saved, { status: saved.kind === "created" ? 201 : 200 });
}
