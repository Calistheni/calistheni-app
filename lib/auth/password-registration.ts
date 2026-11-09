import "server-only";

import { prisma } from "@/lib/prisma";

/** Creates a fresh canonical user and credential; this never revives a tombstone. */
export function createPasswordAccount({
  emailNormalized,
  passwordHash,
}: {
  emailNormalized: string;
  passwordHash: string;
}) {
  return prisma.user.create({
    data: {
      email: emailNormalized,
      passwordCredential: {
        create: { emailNormalized, passwordHash },
      },
    },
    select: { id: true },
  });
}
