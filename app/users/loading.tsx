import { PageSkeleton } from "@/components/loading/PageSkeleton";

export default function UsersLoading() {
  return <PageSkeleton cards={4} showFilters />;
}
