import { POST as complete } from "@/app/api/auth/mobile/complete/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return complete(request);
}
