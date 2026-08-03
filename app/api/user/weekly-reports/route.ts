import { NextResponse } from "next/server";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { generatePreviousWeeklyReport } from "@/lib/weekly-progress-reports";

export async function GET() {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  try { const generated = await generatePreviousWeeklyReport(userId); const reports = await prisma.weeklyProgressReport.findMany({ where: { userId }, orderBy: { weekStart: "desc" } }); return NextResponse.json({ reports, newlyGeneratedReportId: generated.created ? generated.report.id : null }); }
  catch (error) { console.error(error); return createInternalServerErrorResponse(); }
}

export async function POST() { return GET(); }
