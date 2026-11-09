import { normalizeAuthEmail } from "@/lib/auth/password-core";

export type EmailIdentity = {
  userId: string;
  email: string;
  source: "User.email" | "PasswordCredential.emailNormalized";
};

export type EmailCollision = {
  normalizedEmail: string;
  userIds: string[];
  identities: EmailIdentity[];
};

export function findNormalizedEmailCollisions(identities: EmailIdentity[]) {
  const groups = new Map<string, EmailIdentity[]>();
  for (const identity of identities) {
    const normalized = normalizeAuthEmail(identity.email);
    const group = groups.get(normalized) ?? [];
    group.push(identity);
    groups.set(normalized, group);
  }
  const collisions: EmailCollision[] = [];
  for (const [normalizedEmail, group] of groups) {
    const userIds = [...new Set(group.map((identity) => identity.userId))].sort();
    if (userIds.length > 1) {
      collisions.push({ normalizedEmail, userIds, identities: group });
    }
  }
  return collisions.sort((left, right) => left.normalizedEmail.localeCompare(right.normalizedEmail));
}
