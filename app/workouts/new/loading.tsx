import { PageSkeleton } from "@/components/loading/PageSkeleton";

export default function NewWorkoutLoading() {
  return <PageSkeleton cards={3} showFilters />;
}
