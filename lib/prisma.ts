import { createHash } from "node:crypto";
import { validateDatabaseIdentity } from "@/lib/deployment-identity";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { inspectDatabaseIdentity } from "@/lib/production-runtime-attestation";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
  prismaSchemaSignature?: string;
  prismaConnectionFingerprint?: string;
};

const prismaSchemaSignature = Object.entries(
  Prisma as unknown as Record<string, unknown>
)
  .filter(
    ([name, value]) =>
      name.endsWith("ScalarFieldEnum") &&
      typeof value === "object" &&
      value !== null
  )
  .map(
    ([name, value]) =>
      `${name}:${Object.values(value as Record<string, string>).join(",")}`
  )
  .sort()
  .join("|");

function getDatabaseConnectionString() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("Invalid database URL.");
  }
  const { hosted } = validateDatabaseIdentity(databaseUrl);
  const sslMode = databaseUrl.searchParams.get("sslmode");

  if (
    hosted ||
    sslMode === "prefer" ||
    sslMode === "require" ||
    sslMode === "verify-ca"
  ) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
  }

  return databaseUrl.toString();
}

const connectionString = getDatabaseConnectionString();
const connectionFingerprint = createHash("sha256").update(connectionString).digest("hex");
const reusePool =
  globalForPrisma.prismaSchemaSignature === prismaSchemaSignature &&
  globalForPrisma.prismaConnectionFingerprint === connectionFingerprint &&
  globalForPrisma.prisma && globalForPrisma.prismaPool;
const pool = reusePool || new Pool({ connectionString });

export const prisma =
  (reusePool ? globalForPrisma.prisma : undefined) ??
  new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
  });

export async function attestProductionDatabase() {
  // Initialize Prisma's adapter and its idle pool error handler before checkout.
  await prisma.$connect();
  return inspectDatabaseIdentity(pool);
}

if (process.env.NODE_ENV !== "production") {
  if (globalForPrisma.prisma && globalForPrisma.prisma !== prisma) {
    void globalForPrisma.prisma.$disconnect();
  }

  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaPool = pool;
  globalForPrisma.prismaSchemaSignature = prismaSchemaSignature;
  globalForPrisma.prismaConnectionFingerprint = connectionFingerprint;
}
