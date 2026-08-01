import { NextResponse } from "next/server";
import { revalidateFood } from "@/lib/nutrition/service";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await getAuthenticatedUserId())) return createUserUnauthorizedResponse(); return NextResponse.json(await revalidateFood((await params).id, true)); }
