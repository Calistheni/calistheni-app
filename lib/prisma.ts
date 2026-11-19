import { createHash } from "node:crypto";
import { validateDatabaseIdentity } from "@/lib/deployment-identity";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
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
const cachedPrisma =
  globalForPrisma.prismaSchemaSignature === prismaSchemaSignature &&
  globalForPrisma.prismaConnectionFingerprint === connectionFingerprint
    ? globalForPrisma.prisma
    : undefined;

export const prisma =
  cachedPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  if (globalForPrisma.prisma && globalForPrisma.prisma !== prisma) {
    void globalForPrisma.prisma.$disconnect();
  }

  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaSignature = prismaSchemaSignature;
  globalForPrisma.prismaConnectionFingerprint = connectionFingerprint;
}
