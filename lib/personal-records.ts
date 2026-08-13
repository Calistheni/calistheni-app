import "server-only";

import { prisma } from "@/lib/prisma";
import { calculateSetVolumeKg } from "@/lib/workout-volume";
import {
  getSetPersonalRecordValues,
  type PersonalRecordType,
} from "@/lib/personal-record-rules";

export type { PersonalRecordType } from "@/lib/personal-record-rules";

type CandidateRecord = {
  userId: string;
  exerciseId: string;
  type: PersonalRecordType;
  value: number;
  workoutId: number;
  workoutSetId: number | null;
  achievedAt: Date;
};

export const PERSONAL_RECORD_LABELS: Record<PersonalRecordType, string> = {
  MAX_EXTERNAL_WEIGHT: "Max weight",
  MAX_ADDED_WEIGHT: "Max added weight",
  MAX_REPS: "Max reps in one set",
  MAX_SET_VOLUME: "Best set volume",
  MAX_EXERCISE_VOLUME: "Total volume in workout",
  LONGEST_DURATION: "Longest duration",
};

export function formatPersonalRecordValue(
  type: PersonalRecordType,
  value: number
) {
  switch (type) {
    case "MAX_EXTERNAL_WEIGHT":
    case "MAX_ADDED_WEIGHT":
    case "MAX_SET_VOLUME":
    case "MAX_EXERCISE_VOLUME":
      return `${Math.round(value).toLocaleString()} kg`;
    case "MAX_REPS":
      return `${Math.round(value).toLocaleString()} reps`;
    case "LONGEST_DURATION": {
      const minutes = Math.floor(value / 60);
      const seconds = Math.round(value % 60);

      if (minutes === 0) {
        return `${seconds} sec`;
      }

      return seconds === 0 ? `${minutes} min` : `${minutes}m ${seconds}s`;
    }
  }
}

function shouldReplaceRecord(
  existingRecord: CandidateRecord | undefined,
  candidate: CandidateRecord
) {
  if (!existingRecord) {
    return true;
  }

  if (candidate.value > existingRecord.value) {
    return true;
  }

  return (
    candidate.value === existingRecord.value &&
    candidate.achievedAt < existingRecord.achievedAt
  );
}

function recordKey(exerciseId: string, type: PersonalRecordType) {
  return `${exerciseId}:${type}`;
}

function addCandidate(
  records: Map<string, CandidateRecord>,
  candidate: CandidateRecord
) {
  const key = recordKey(candidate.exerciseId, candidate.type);

  if (shouldReplaceRecord(records.get(key), candidate)) {
    records.set(key, candidate);
  }
}

export async function recomputeUserPersonalRecords(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      bodyweightKg: true,
    },
  });

  if (!user) {
    return;
  }

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
    },
    orderBy: {
      startedAt: "asc",
    },
    include: {
      exercises: {
        include: {
          exercise: true,
          sets: {
            where: {
              completed: true,
            },
            orderBy: {
              order: "asc",
            },
          },
        },
      },
    },
  });
  const records = new Map<string, CandidateRecord>();

  for (const workout of workouts) {
    for (const workoutExercise of workout.exercises) {
      let exerciseVolume = 0;
      let exerciseVolumeAvailable = true;
      let hasCompletedSet = false;
      let representativeSetId: number | null = null;

      for (const set of workoutExercise.sets) {
        hasCompletedSet = true;
        representativeSetId ??= set.id;
        const baseRecord = {
          userId,
          exerciseId: workoutExercise.exerciseId,
          workoutId: workout.id,
          workoutSetId: set.id,
          achievedAt: workout.completedAt ?? workout.startedAt,
        };

        for (const [type, value] of Object.entries(
          getSetPersonalRecordValues({
            set,
            trackingType: workoutExercise.exercise.trackingType,
          })
        ) as Array<[PersonalRecordType, number]>) {
          addCandidate(records, { ...baseRecord, type, value });
        }

        const setVolume = calculateSetVolumeKg({
          trackingType: workoutExercise.exercise.trackingType,
          reps: set.reps,
          weightKg: set.weight,
          userBodyweightKg: user.bodyweightKg,
          bodyweightLoadFactor: workoutExercise.exercise.bodyweightLoadFactor,
        });

        if (setVolume === null) {
          exerciseVolumeAvailable = false;
        } else {
          exerciseVolume += setVolume;

          if (setVolume > 0) {
            addCandidate(records, {
              ...baseRecord,
              type: "MAX_SET_VOLUME",
              value: setVolume,
            });
          }
        }
      }

      if (hasCompletedSet && exerciseVolumeAvailable && exerciseVolume > 0) {
        addCandidate(records, {
          userId,
          exerciseId: workoutExercise.exerciseId,
          type: "MAX_EXERCISE_VOLUME",
          value: exerciseVolume,
          workoutId: workout.id,
          workoutSetId: representativeSetId,
          achievedAt: workout.completedAt ?? workout.startedAt,
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.personalRecord.deleteMany({
      where: {
        userId,
      },
    });

    if (records.size === 0) {
      return;
    }

    await tx.personalRecord.createMany({
      data: [...records.values()],
    });
  });
}
