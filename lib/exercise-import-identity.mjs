export function findExerciseByCanonicalSlug(exercises, slug) {
  return exercises.find((exercise) => exercise.slug === slug) ?? null;
}

export function applyCanonicalExerciseUpsert(exercises, incomingExercise) {
  const existing = findExerciseByCanonicalSlug(
    exercises,
    incomingExercise.slug
  );

  if (!existing) {
    return [...exercises, incomingExercise];
  }

  return exercises.map((exercise) =>
    exercise.slug === incomingExercise.slug
      ? { ...exercise, ...incomingExercise }
      : exercise
  );
}
