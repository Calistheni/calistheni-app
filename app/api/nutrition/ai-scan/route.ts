import { NextResponse } from "next/server";
import { createJsonErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { analyzeNutritionImage, nutritionAiConfigured } from "@/lib/nutrition/ai-provider";
import { consumeNutritionAiRateLimit } from "@/lib/nutrition/ai-rate-limit";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
function validSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index]);
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  if (!nutritionAiConfigured()) return createJsonErrorResponse("AI food scanning is not configured. Set OPENAI_API_KEY on the server.", 503, "AI_NOT_CONFIGURED");
  const retryAfterSeconds = consumeNutritionAiRateLimit(userId);
  if (retryAfterSeconds !== null) {
    return NextResponse.json(
      { error: { message: "Too many AI food scans. Try again shortly.", code: "AI_RATE_LIMITED" } },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  const form = await request.formData(); const image = form.get("image"); const rawDescription = form.get("description");
  const description = typeof rawDescription === "string" && rawDescription.length ? rawDescription : null;
  if (!(image instanceof File) || image.size < 1 || image.size > MAX_IMAGE_BYTES) return createJsonErrorResponse("Choose an image smaller than 4 MB.", 400, "INVALID_IMAGE");
  if (description && description.length > 200) return createJsonErrorResponse("Description must be 200 characters or fewer.", 400, "INVALID_DESCRIPTION");
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!validSignature(bytes, image.type)) return createJsonErrorResponse("Use a JPEG, PNG, or WebP image.", 400, "INVALID_IMAGE");
  try { return NextResponse.json(await analyzeNutritionImage(Buffer.from(bytes), image.type, description)); }
  catch (error) { const code = error instanceof Error ? error.message : "AI_UNAVAILABLE"; const malformed = code === "AI_MALFORMED_RESPONSE"; const rateLimited = code === "AI_RATE_LIMITED"; return createJsonErrorResponse(malformed ? "The food scan returned an invalid result. Try another photo." : rateLimited ? "AI food scanning is busy. Try again shortly." : "AI food scanning is temporarily unavailable.", malformed ? 502 : rateLimited ? 429 : 503, code); }
}
