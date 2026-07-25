export type RoutineSupersetMembershipInput = {
  key: string;
  exerciseClientIds: string[];
};

export type ResolvedRoutineSupersetMembership = {
  requestSupersetKey: string;
  members: Array<{
    clientExerciseId: string;
    persistedExerciseId: number;
    position: number;
  }>;
};

export class UnresolvedRoutineExerciseError extends Error {
  readonly code = "UNRESOLVED_ROUTINE_EXERCISE";
  readonly clientExerciseId: string;

  constructor(clientExerciseId: string) {
    super(`Routine exercise "${clientExerciseId}" could not be resolved.`);
    this.name = "UnresolvedRoutineExerciseError";
    this.clientExerciseId = clientExerciseId;
  }
}

export function resolveRoutineSupersetMemberships(
  supersets: RoutineSupersetMembershipInput[],
  persistedExerciseIds: ReadonlyMap<string, number>
): ResolvedRoutineSupersetMembership[] {
  return supersets.map((superset) => ({
    requestSupersetKey: superset.key,
    members: superset.exerciseClientIds.map(
      (clientExerciseId, position) => {
        const persistedExerciseId =
          persistedExerciseIds.get(clientExerciseId);

        if (!persistedExerciseId) {
          throw new UnresolvedRoutineExerciseError(clientExerciseId);
        }

        return {
          clientExerciseId,
          persistedExerciseId,
          position,
        };
      }
    ),
  }));
}
