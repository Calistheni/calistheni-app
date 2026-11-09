import { prisma } from "../lib/prisma";
import { findNormalizedEmailCollisions, type EmailIdentity } from "../lib/auth/email-collision-preflight";

async function main() {
  const [users, credentials] = await Promise.all([
    prisma.user.findMany({ where: { email: { not: null } }, select: { id: true, email: true } }),
    prisma.passwordCredential.findMany({ select: { userId: true, emailNormalized: true } }),
  ]);
  const identities: EmailIdentity[] = [
    ...users.flatMap((user) => user.email ? [{ userId: user.id, email: user.email, source: "User.email" as const }] : []),
    ...credentials.map((credential) => ({
      userId: credential.userId,
      email: credential.emailNormalized,
      source: "PasswordCredential.emailNormalized" as const,
    })),
  ];
  const collisions = findNormalizedEmailCollisions(identities);
  if (collisions.length === 0) {
    console.log("No runtime-normalized authentication email collisions found.");
    return;
  }
  console.error(`Found ${collisions.length} normalized email collision group(s). No data was changed.`);
  for (const collision of collisions) {
    console.error(JSON.stringify({
      normalizedEmail: collision.normalizedEmail,
      userIds: collision.userIds,
      identities: collision.identities,
    }));
  }
  process.exitCode = 2;
}

main().finally(() => prisma.$disconnect());
