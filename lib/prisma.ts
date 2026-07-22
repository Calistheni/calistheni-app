import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaSchemaSignature?: string;
};

const prismaSchemaSignature = Object.values(Prisma.UserScalarFieldEnum).join(
  ":"
);

function getDatabaseConnectionString() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }

  const databaseUrl = new URL(connectionString);
  const sslMode = databaseUrl.searchParams.get("sslmode");

  if (
    sslMode === "prefer" ||
    sslMode === "require" ||
    sslMode === "verify-ca"
  ) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
  }

  return databaseUrl.toString();
}

const cachedPrisma =
  globalForPrisma.prismaSchemaSignature === prismaSchemaSignature
    ? globalForPrisma.prisma
    : undefined;

export const prisma =
  cachedPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getDatabaseConnectionString(),
    }),
  });

if (process.env.NODE_ENV !== "production") {
  if (globalForPrisma.prisma && globalForPrisma.prisma !== prisma) {
    void globalForPrisma.prisma.$disconnect();
  }

  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaSignature = prismaSchemaSignature;
}
