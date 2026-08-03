import { NextResponse } from "next/server";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { getSupplementDashboard } from "@/lib/supplement-service";
export async function GET() { const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); return NextResponse.json(await getSupplementDashboard(userId)); }
