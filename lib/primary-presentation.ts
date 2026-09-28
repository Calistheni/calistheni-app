import { z } from "zod";

const nullableNumber = z.number().finite().nullable();
export const PRIMARY_PRESENTATION_CONTRACT_VERSION = 1;

const completeSnapshotSchema = z.object({
  contractVersion: z.literal(PRIMARY_PRESENTATION_CONTRACT_VERSION),
  completeness: z.literal("complete"),
  generatedAt: z.string().datetime(),
});

export const primarySchemas = {
  home: z.object({
    snapshot: completeSnapshotSchema,
    greetingName: z.string(), asOf: z.string(), streakDays: z.number().finite(),
    week: z.object({ startsAt: z.string(), workouts: z.number().finite(), completedSets: z.number().finite(), totalVolumeKg: nullableNumber, activeDays: z.number().finite(), totalReps: z.number().finite(), durationSeconds: z.number().finite(), personalRecords: z.number().finite(), workoutGoal: z.number().finite() }),
    recentWorkout: z.object({ id: z.number(), title: z.string(), completedAt: z.string().nullable() }).nullable(),
  }),
  nutrition: z.object({ snapshot: completeSnapshotSchema, date: z.string(), totals: z.record(z.string(), z.number().finite().nullable().optional()), goal: z.record(z.string(), z.union([z.number(), z.string()])).nullable(), entryCount: z.number().finite(), updatedAt: z.string() }),
  parks: z.object({ snapshot: completeSnapshotSchema, publicParkCount: z.number().finite(), version: z.string().nullable(), updatedAt: z.string() }),
  community: z.object({ snapshot: completeSnapshotSchema, items: z.array(z.object({ id: z.number(), title: z.string(), completedAt: z.string().nullable(), exerciseCount: z.number().finite(), setCount: z.number().finite(), totalVolume: nullableNumber, athlete: z.object({ id: z.string(), name: z.string().nullable(), image: z.string().nullable() }) })), updatedAt: z.string() }),
  rewards: z.object({ snapshot: completeSnapshotSchema, balance: z.number().finite(), rewards: z.array(z.object({ id: z.number(), title: z.string(), partnerName: z.string(), description: z.string(), imageUrl: z.string().nullable(), pointsCost: z.number().finite() })), redemptions: z.array(z.object({ id: z.number(), rewardId: z.number(), status: z.string(), createdAt: z.string() })), entitlement: z.object({ isPro: z.boolean(), canEarnRewardPoints: z.boolean() }), updatedAt: z.string() }),
  profile: z.object({ snapshot: completeSnapshotSchema, user: z.object({ id: z.string(), name: z.string().nullable(), username: z.string().nullable(), image: z.string().nullable() }), stats: z.object({ workouts: z.number().finite(), completedSets: z.number().finite(), submittedParks: z.number().finite(), approvedEdits: z.number().finite(), approvedPhotos: z.number().finite(), rewardPoints: z.number().finite(), followers: z.number().finite(), following: z.number().finite() }), body: z.object({ bodyweightKg: nullableNumber, measurementSystem: z.enum(["METRIC", "IMPERIAL"]) }), entitlement: z.object({ isPro: z.boolean() }), updatedAt: z.string() }),
} as const;

export type PrimaryPresentationName = keyof typeof primarySchemas;
export type PrimaryPresentationData = {
  [Name in PrimaryPresentationName]: z.infer<(typeof primarySchemas)[Name]>;
};

export const primaryPresentationNames = Object.keys(primarySchemas) as PrimaryPresentationName[];
export const PRIMARY_PRESENTATION_VERSION = 2;
export const primaryPresentationKeys = {
  root: ["web", "primary-presentation"] as const,
  snapshot: (userId: string, name: PrimaryPresentationName) => ["web", "primary-presentation", PRIMARY_PRESENTATION_VERSION, userId, name] as const,
};

export type PersistedPrimaryPresentation = { version: number; userId: string; name: PrimaryPresentationName; savedAt: string; data: unknown };

export function completePrimaryPresentation<T extends Record<string, unknown>>(data: T, generatedAt = new Date()) {
  return { ...data, snapshot: { contractVersion: PRIMARY_PRESENTATION_CONTRACT_VERSION, completeness: "complete" as const, generatedAt: generatedAt.toISOString() } };
}

export function decodePrimaryPresentation<Name extends PrimaryPresentationName>(value: unknown, userId: string, name: Name): PrimaryPresentationData[Name] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<PersistedPrimaryPresentation>;
  if (record.version !== PRIMARY_PRESENTATION_VERSION || record.userId !== userId || record.name !== name) return undefined;
  const parsed = primarySchemas[name].safeParse(record.data);
  return parsed.success ? parsed.data as PrimaryPresentationData[Name] : undefined;
}

export function createPrimaryPresentation<Name extends PrimaryPresentationName>(userId: string, name: Name, data: unknown): PersistedPrimaryPresentation {
  const parsed = primarySchemas[name].parse(data);
  return { version: PRIMARY_PRESENTATION_VERSION, userId, name, savedAt: new Date().toISOString(), data: parsed };
}

export function selectLastKnownGood<Name extends PrimaryPresentationName>(
  name: Name,
  current: PrimaryPresentationData[Name] | undefined,
  candidate: unknown
): PrimaryPresentationData[Name] {
  const complete = primarySchemas[name].parse(candidate) as PrimaryPresentationData[Name];
  if (
    current &&
    Date.parse(current.snapshot.generatedAt) >
      Date.parse(complete.snapshot.generatedAt)
  ) {
    return current;
  }
  return complete;
}
