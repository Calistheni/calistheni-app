import { createProductionAttestationHandler } from "@/lib/production-runtime-attestation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export const POST = createProductionAttestationHandler({
  async attest() {
    const { attestProductionDatabase } = await import("@/lib/prisma");
    return attestProductionDatabase();
  },
});
