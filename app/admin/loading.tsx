import { PageSkeleton } from "@/components/loading/PageSkeleton";

export default function AdminLoading() {
  return <PageSkeleton cards={4} showFilters />;
}
