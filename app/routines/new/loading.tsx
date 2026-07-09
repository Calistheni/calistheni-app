import { PageSkeleton } from "@/components/loading/PageSkeleton";

export default function NewRoutineLoading() {
  return <PageSkeleton cards={3} showFilters />;
}
