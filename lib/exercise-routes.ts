export function getExerciseRecordHref(exerciseSlug: string) {
  return `/profile/records/${encodeURIComponent(exerciseSlug)}`;
}
