import { PageSkeleton } from "@/components/loading/PageSkeleton";
import { WorkoutRouteLoading } from "@/components/workouts/WorkoutRouteLoading";

export default function WorkoutsLoading() {
  return (
    <WorkoutRouteLoading>
      <PageSkeleton cards={4} />
    </WorkoutRouteLoading>
  );
}
