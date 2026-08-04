import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { optionalNoteSchema } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { getSupplementLogEligibility, parseSupplementDateKey } from "@/lib/supplement-log";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const completionSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  note: optionalNoteSchema.optional(),
});

async function readCompletion(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: createJsonValidationErrorResponse("Invalid supplement completion date.", { scheduledDate: ["Use YYYY-MM-DD."] }) };
  }
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) {
    return { error: createJsonValidationErrorResponse("Invalid supplement completion date.", parsed.error.flatten().fieldErrors) };
  }
  const scheduledFor = parseSupplementDateKey(parsed.data.scheduledDate);
  if (!scheduledFor) {
    return { error: createJsonValidationErrorResponse("Invalid supplement completion date.", { scheduledDate: ["Use YYYY-MM-DD."] }) };
  }
  return { value: { scheduledFor, note: parsed.data.note } };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const completion = await readCompletion(request);
  if ("error" in completion) return completion.error;
  const { id } = await params;

  try {
    const plan = await prisma.userSupplementPlan.findFirst({
      where: { id, userId },
      include: { supplementDefinition: true },
    });
    if (!plan) return createJsonErrorResponse("Supplement plan not found.", 404);
    const eligibility = getSupplementLogEligibility(plan, completion.value.scheduledFor);
    if (!eligibility.eligible) return createJsonErrorResponse(eligibility.error, 409);

    const existing = await prisma.supplementLog.findUnique({
      where: { userSupplementPlanId_scheduledFor: { userSupplementPlanId: id, scheduledFor: completion.value.scheduledFor } },
    });
    if (existing) return NextResponse.json({ log: existing, created: false });

    let log;
    try {
      log = await prisma.supplementLog.create({
        data: {
          userSupplementPlanId: id,
          scheduledFor: completion.value.scheduledFor,
          dosageSnapshot: plan.dosage,
          unitSnapshot: plan.unit,
          supplementNameSnapshot: plan.supplementDefinition?.name ?? plan.customName ?? "Supplement",
          note: completion.value.note,
        },
      });
    } catch (error) {
      const concurrentLog = await prisma.supplementLog.findUnique({
        where: { userSupplementPlanId_scheduledFor: { userSupplementPlanId: id, scheduledFor: completion.value.scheduledFor } },
      });
      if (concurrentLog) return NextResponse.json({ log: concurrentLog, created: false });
      throw error;
    }
    return NextResponse.json({ log, created: true }, { status: 201 });
  } catch (error) {
    console.error("SUPPLEMENT_LOG_CREATE_FAILED", error);
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { id } = await params;
  const scheduledFor = parseSupplementDateKey(new URL(request.url).searchParams.get("scheduledDate"));
  if (!scheduledFor) {
    return createJsonValidationErrorResponse("Invalid supplement completion date.", { scheduledDate: ["Use YYYY-MM-DD."] });
  }
  const result = await prisma.supplementLog.deleteMany({
    where: { userSupplementPlanId: id, scheduledFor, plan: { userId } },
  });
  return NextResponse.json({ ok: true, removed: result.count > 0 });
}
