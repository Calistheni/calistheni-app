import { getParkDetail } from "@/lib/parks";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const { id } = await params;

  const park = await getParkDetail(Number(id));

  if (!park) {
    return NextResponse.json({ error: "Park not found" }, { status: 404 });
  }

  return NextResponse.json(park);
}
