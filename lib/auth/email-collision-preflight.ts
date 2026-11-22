import { normalizeAuthEmail } from "@/lib/auth/password-core";

export type EmailIdentity = {
  userId: string;
  email: string | null;
};

export function summarizeEmailCollisions(identities: readonly EmailIdentity[]) {
  const groups = new Map<string, { firstOwner: string; records: number; conflicting: boolean }>();
  for (const { userId, email } of identities) {
    const normalized = normalizeAuthEmail(email ?? "");
    if (!normalized) continue;

    const group = groups.get(normalized);
    if (group) {
      group.records++;
      group.conflicting ||= group.firstOwner !== userId;
    } else {
      groups.set(normalized, { firstOwner: userId, records: 1, conflicting: false });
    }
  }

  let collisionGroups = 0;
  let affectedRecords = 0;
  for (const group of groups.values()) {
    if (!group.conflicting) continue;
    collisionGroups++;
    affectedRecords += group.records;
  }
  return { collisionGroups, affectedRecords };
}
