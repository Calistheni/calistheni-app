import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { readAuthSessionToken } from "@/lib/auth/database-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid credential-state request." }, { status: 403 });
  }
  const sessionToken = readAuthSessionToken(request);
  if (!sessionToken) return NextResponse.json({ ok: true, invalidated: false });
  // A native credential-state signal may terminate only the caller's own
  // Apple-authenticated session. Server notifications remain authoritative
  // for revoking every session associated with the Apple identity.
  const deleted = await prisma.session.deleteMany({
    where: { sessionToken, purpose: "APPLICATION", authProvider: "apple" },
  });
  return NextResponse.json({ ok: true, invalidated: deleted.count === 1 });
}
