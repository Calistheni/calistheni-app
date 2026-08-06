import { NextResponse } from "next/server";
import { z } from "zod";
import { createInternalServerErrorResponse, createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const timezoneSchema = z.string().trim().min(1).max(100).refine((value) => {
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
}, "Use a valid IANA timezone.");
const updateSchema = z.object({
  enabled: z.boolean().optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  reminderMinute: z.number().int().min(0).max(59).optional(),
  timezone: timezoneSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide a reminder setting to update.");

const defaults = { enabled: false, reminderHour: 19, reminderMinute: 0, timezone: null, permissionState: null };
export async function GET() {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  try { return NextResponse.json((await prisma.userSupplementReminderSettings.findUnique({ where: { userId } })) ?? defaults); }
  catch (error) { console.error("SUPPLEMENT_REMINDER_SETTINGS_GET_FAILED", error); return createInternalServerErrorResponse(); }
}
export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  let body: unknown; try { body = await request.json(); } catch { return createJsonErrorResponse("Invalid JSON payload.", 400); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return createJsonValidationErrorResponse("Invalid reminder settings.", parsed.error.flatten().fieldErrors);
  try {
    const settings = await prisma.userSupplementReminderSettings.upsert({ where: { userId }, create: { userId, ...parsed.data }, update: parsed.data });
    return NextResponse.json(settings);
  } catch (error) { console.error("SUPPLEMENT_REMINDER_SETTINGS_UPDATE_FAILED", error); return createInternalServerErrorResponse(); }
}
